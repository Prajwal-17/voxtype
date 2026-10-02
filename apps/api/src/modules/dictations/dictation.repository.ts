import { and, desc, eq, like, lt, or, type SQL } from 'drizzle-orm';
import { createDb } from '../../shared/database/client';
import { dictation, type NewDictation } from '../../shared/database/schema';
import type { DictationCursor } from './dictation.types';

type FindPageOptions = {
  userId: string;
  limit: number;
  cursor: DictationCursor | null;
  query?: string;
};

export function createDictationRepository(database: D1Database) {
  const db = createDb(database);

  return {
    async findPage(options: FindPageOptions) {
      const conditions: SQL[] = [eq(dictation.userId, options.userId)];

      if (options.cursor) {
        conditions.push(
          or(
            lt(dictation.createdAt, new Date(options.cursor.createdAt)),
            and(
              eq(dictation.createdAt, new Date(options.cursor.createdAt)),
              lt(dictation.id, options.cursor.id),
            ),
          )!,
        );
      }
      if (options.query) conditions.push(like(dictation.text, `%${options.query}%`));

      return db
        .select()
        .from(dictation)
        .where(and(...conditions))
        .orderBy(desc(dictation.createdAt), desc(dictation.id))
        .limit(options.limit + 1);
    },

    findById(userId: string, id: string) {
      return db
        .select()
        .from(dictation)
        .where(and(eq(dictation.id, id), eq(dictation.userId, userId)))
        .get();
    },

    findOwner(id: string) {
      return db
        .select({ userId: dictation.userId })
        .from(dictation)
        .where(eq(dictation.id, id))
        .get();
    },

    async insert(values: NewDictation) {
      const [created] = await db.insert(dictation).values(values).returning();
      return created!;
    },

    async upsert(values: NewDictation) {
      const [saved] = await db
        .insert(dictation)
        .values(values)
        .onConflictDoUpdate({
          target: dictation.id,
          set: {
            text: values.text,
            originalText: values.originalText,
            createdAt: values.createdAt,
            updatedAt: new Date(),
            durationMs: values.durationMs,
            wordCount: values.wordCount,
            source: values.source,
          },
          // Protect ownership even if another account inserts this ID after findOwner.
          setWhere: eq(dictation.userId, values.userId),
        })
        .returning();
      return saved;
    },

    remove(userId: string, id: string) {
      return db
        .delete(dictation)
        .where(and(eq(dictation.id, id), eq(dictation.userId, userId)))
        .returning({ id: dictation.id });
    },

    removeAll(userId: string) {
      return db
        .delete(dictation)
        .where(eq(dictation.userId, userId))
        .returning({ id: dictation.id });
    },
  };
}
