import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createAnalyticsService } from '../apps/api/src/modules/analytics/analytics.service';
import {
  cleanupCost,
  parseUsage,
  speechCost,
} from '../apps/api/src/modules/analytics/analytics.costs';
import { wordsPerMinute, startOfRange } from '../apps/api/src/modules/analytics/analytics.utils';
import { createDictationService } from '../apps/api/src/modules/dictations/dictation.service';
import { cleanTranscript } from '../apps/api/src/modules/speech/speech.service';

const worker = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-10-02',
    d1Databases: ['DB'],
  }),
);
const db = await worker.getD1Database('DB');
const transcripts = createDictationService(db);
const analytics = createAnalyticsService(db);
before(async () => {
  const directory = new URL('../apps/api/migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(name, directory), 'utf8');
    for (const statement of sql
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
  }
  for (const id of ['alice', 'bob', 'empty'])
    await db
      .prepare(
        'INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,0,?,?)',
      )
      .bind(id, id, `${id}@example.test`, Date.now(), Date.now())
      .run();
});
after(() => worker.dispose());
test('costs use duration and provider token usage, never word count', () => {
  assert.deepEqual(speechCost(60000), { min: 0.0048, max: 0.0071 });
  assert.deepEqual(speechCost(-1), { min: 0, max: 0 });
  assert.equal(
    cleanupCost({
      prompt_tokens: 1_000_000,
      prompt_cache_hit_tokens: 500_000,
      completion_tokens: 100_000,
    }),
    0.273,
  );
  for (const invalid of [
    null,
    {},
    { prompt_tokens: -1, completion_tokens: 2 },
    { prompt_tokens: 1, completion_tokens: 2, prompt_cache_hit_tokens: 3 },
  ])
    assert.equal(parseUsage(invalid), null);
  assert.equal(wordsPerMinute(12, 0), 0);
  assert.equal(wordsPerMinute(100, 60000), 100);
  assert.equal(startOfRange('all'), null);
  assert.equal(startOfRange('7d', 604800000)?.getTime(), 0);
});
test('cursor pagination is stable for equal timestamps and excludes other accounts', async () => {
  const now = Date.now();
  for (let index = 0; index < 25; index++)
    await transcripts.upsert('alice', `page-${String(index).padStart(2, '0')}`, {
      text: 'two words',
      createdAt: now,
      durationMs: 60000,
      source: index % 2 ? 'mobile' : 'desktop',
    });
  await transcripts.upsert('bob', 'private', {
    text: 'private transcript',
    createdAt: now + 1,
    durationMs: 1000,
    source: 'mobile',
  });
  const first = await transcripts.list('alice', { limit: 12 });
  assert.equal(first.data.length, 12);
  assert.ok(first.nextCursor);
  const second = await transcripts.list('alice', { limit: 12, cursor: first.nextCursor });
  const third = await transcripts.list('alice', { limit: 12, cursor: second.nextCursor! });
  assert.equal(third.data.length, 1);
  assert.equal(third.nextCursor, null);
  assert.equal(
    new Set([...first.data, ...second.data, ...third.data].map((row) => row.id)).size,
    25,
  );
  assert.equal((await transcripts.list('alice', { limit: 12, q: 'private' })).data.length, 0);
  await assert.rejects(transcripts.get('bob', 'page-00'));
  await assert.rejects(
    transcripts.upsert('bob', 'page-00', {
      text: 'replace',
      createdAt: now,
      durationMs: 1,
      source: 'mobile',
    }),
  );
  await assert.rejects(transcripts.list('alice', { limit: 12, cursor: 'invalid' }));
});
test('analytics deduplicate retried uploads, aggregate both clients and isolate usage', async () => {
  await transcripts.upsert('alice', 'page-00', {
    text: 'two words',
    createdAt: Date.now(),
    durationMs: 60000,
    source: 'desktop',
  });
  await db
    .prepare('INSERT INTO speech_usage VALUES (?,?,?,?,?,?,?)')
    .bind('cleanup-1', 'alice', Date.now(), 100, 0, 50, 0.00009)
    .run();
  await db
    .prepare('INSERT INTO speech_usage VALUES (?,?,?,?,?,?,?)')
    .bind('cleanup-2', 'bob', Date.now(), 100, 0, 50, 9)
    .run();
  const data = await analytics.get('alice', '30d');
  assert.equal(data.summary.dictations, 25);
  assert.equal(data.summary.totalWords, 50);
  assert.equal(data.summary.totalDurationMs, 1500000);
  assert.equal(data.summary.averageDurationMs, 60000);
  assert.equal(data.costs.deepseek, 0.00009);
  assert.equal(data.costs.cleanupRequests, 1);
  assert.equal(
    data.daily.reduce((total, row) => total + row.words, 0),
    50,
  );
  const empty = await analytics.get('empty', 'all');
  assert.equal(empty.summary.averageDurationMs, 0);
  assert.equal(empty.costs.deepseek, 0);
  assert.deepEqual(empty.daily, []);
  await transcripts.remove('alice', 'page-00');
  assert.equal((await analytics.get('alice', 'all')).costs.cleanupRequests, 1);
});
test('cleanup preserves original on failure and returns real usage on success', async () => {
  const mock = (body: unknown, status = 200) =>
    (async () => Response.json(body, { status })) as typeof fetch;
  const result = await cleanTranscript(
    'hello',
    'test',
    mock({
      choices: [{ message: { content: 'Hello.' } }],
      usage: { prompt_tokens: 100, completion_tokens: 2, prompt_cache_hit_tokens: 20 },
    }),
  );
  assert.equal(result.text, 'Hello.');
  assert.equal(result.usage?.prompt_tokens, 100);
  assert.equal((await cleanTranscript('hello', 'test', mock({}, 503))).text, 'hello');
  const missing = await cleanTranscript(
    'hello',
    'test',
    mock({ choices: [{ message: { content: 'Hello.' } }] }),
  );
  assert.equal(missing.usage, null);
  assert.equal(missing.metered, true);
});
