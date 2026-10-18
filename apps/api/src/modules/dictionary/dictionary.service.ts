import { z } from 'zod';
import { ApiError } from '../../shared/errors/api-error';

const terms = z.array(z.string().trim().min(1).max(100)).max(100);
export const dictionaryPatch = z.object({
  base: terms,
  terms,
  importId: z.string().uuid().optional(),
});
type Patch = z.infer<typeof dictionaryPatch>;
type Row = { terms: string; revision: number; imports: string };
const key = (term: string) => term.toLowerCase();

/** Apply only the user's changes to the latest document, preserving other devices' edits. */
export function mergeTerms(current: string[], base: string[], next: string[]) {
  const before = new Set(base.map(key));
  const after = new Set(next.map(key));
  const removed = new Set([...before].filter((term) => !after.has(term)));
  const merged = new Map(
    current.filter((term) => !removed.has(key(term))).map((term) => [key(term), term]),
  );
  for (const term of next)
    if (!before.has(key(term)) && !merged.has(key(term))) merged.set(key(term), term);
  if (merged.size > 100)
    throw new ApiError(
      409,
      'dictionary_full',
      'Your dictionary is full. Refresh and remove a word before adding another.',
    );
  return [...merged.values()];
}

export function createDictionaryService(db: D1Database) {
  const read = (userId: string) =>
    db
      .prepare('SELECT terms, revision, imports FROM account_dictionary WHERE user_id = ?')
      .bind(userId)
      .first<Row>();
  const document = (row: Row | null) => ({
    terms: row ? (JSON.parse(row.terms) as string[]) : [],
    revision: row?.revision ?? 0,
  });
  return {
    async get(userId: string) {
      return document(await read(userId));
    },
    async update(userId: string, input: Patch) {
      const patch = dictionaryPatch.parse(input);
      await db
        .prepare('INSERT INTO account_dictionary (user_id) VALUES (?) ON CONFLICT DO NOTHING')
        .bind(userId)
        .run();
      for (let attempt = 0; attempt < 8; attempt++) {
        const row = (await read(userId))!;
        const imports = JSON.parse(row.imports) as string[];
        // An import retry must not resurrect words deleted after its first successful response.
        if (patch.importId && imports.includes(patch.importId)) return document(row);
        const merged = mergeTerms(JSON.parse(row.terms), patch.base, patch.terms);
        if (patch.importId) imports.push(patch.importId);
        const result = await db
          .prepare(
            'UPDATE account_dictionary SET terms = ?, imports = ?, revision = revision + 1 WHERE user_id = ? AND revision = ?',
          )
          .bind(JSON.stringify(merged), JSON.stringify(imports), userId, row.revision)
          .run();
        if (result.meta.changes) return { terms: merged, revision: row.revision + 1 };
      }
      throw new ApiError(
        409,
        'dictionary_busy',
        'Your dictionary changed on another device. Please try again.',
      );
    },
  };
}
