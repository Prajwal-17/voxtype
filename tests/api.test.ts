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
  assert.equal(startOfRange('7d', 604800000)?.getTime(), 86400000);
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

test('local calendar ranges handle fractional offsets, midnight and DST without losing records', async () => {
  const userId = 'calendar';
  await db
    .prepare(
      'INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,0,0,0)',
    )
    .bind(userId, userId, 'calendar@example.test')
    .run();
  const add = async (id: string, time: string, words = 2) =>
    transcripts.upsert(userId, id, {
      text: Array<string>(words).fill('word').join(' '),
      createdAt: Date.parse(time),
      durationMs: 60000,
      source: 'mobile',
    });
  await add('before-india-midnight', '2026-10-10T18:29:59Z');
  await add('after-india-midnight', '2026-10-10T18:30:00Z');
  const india = await analytics.get(userId, '7d', 'Asia/Kolkata', Date.parse('2026-10-11T12:00Z'));
  assert.equal(india.period.start, '2026-10-05');
  assert.equal(india.daily.find((d) => d.date === '2026-10-10')?.dictations, 1);
  assert.equal(india.daily.find((d) => d.date === '2026-10-11')?.dictations, 1);
  assert.deepEqual(india.streaks, { current: 2, longest: 2 });
  assert.equal(india.activity.days.length, 98);
  assert.equal(new Date(`${india.activity.start}T12:00Z`).getUTCDay(), 1);
  await add('outside-seven', '2026-10-27T03:59:59Z');
  await add('start-seven', '2026-10-27T04:00:00Z');
  await add('dst-first-130', '2026-11-01T05:30:00Z');
  await add('dst-second-130', '2026-11-01T06:30:00Z');
  await add('future', '2026-11-03T10:00Z');
  const ny = await analytics.get(userId, '7d', 'America/New_York', Date.parse('2026-11-02T16:00Z'));
  assert.equal(ny.period.start, '2026-10-27');
  assert.equal(ny.summary.dictations, 3);
  assert.equal(ny.daily.find((d) => d.date === '2026-11-01')?.dictations, 2);
  assert.equal(ny.daily.find((d) => d.date === '2026-11-02')?.dictations, 0);
  const { startOfRange: rangeStart } =
    await import('../apps/api/src/modules/analytics/analytics.utils');
  assert.equal(
    rangeStart('7d', Date.parse('2026-11-02T16:00Z'), 'America/New_York')?.toISOString(),
    '2026-10-27T04:00:00.000Z',
  );
});

test('full-history streaks remain independent of range and the bounded calendar; CSV contains real daily data', async () => {
  const owner = 'streaks';
  await db
    .prepare(
      'INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,0,0,0)',
    )
    .bind(owner, owner, 'streaks@example.test')
    .run();
  for (let day = 1; day <= 10; day++)
    await transcripts.upsert(owner, `old-${day}`, {
      text: 'one two three',
      createdAt: Date.parse(`2025-01-${String(day).padStart(2, '0')}T12:00Z`),
      durationMs: 30000,
      source: 'desktop',
    });
  for (const day of ['2026-10-10', '2026-10-11'])
    await transcripts.upsert(owner, day, {
      text: 'four words in session',
      createdAt: Date.parse(`${day}T10:00Z`),
      durationMs: 60000,
      source: 'mobile',
    });
  const now = Date.parse('2026-10-11T12:00Z');
  const short = await analytics.get(owner, '7d', 'UTC', now),
    all = await analytics.get(owner, 'all', 'UTC', now);
  assert.deepEqual(short.streaks, { current: 2, longest: 10 });
  assert.deepEqual(all.streaks, short.streaks);
  assert.deepEqual(all.activity, short.activity);
  assert.equal(short.summary.activeDays, 2);
  assert.equal(short.summary.averageWordsPerMinute, 4);
  assert.equal(all.summary.dictations, 12);
  assert.ok(all.trend.days.length <= 120);
  assert.equal(
    all.trend.days.reduce((n, d) => n + d.words, 0),
    all.summary.totalWords,
  );
  assert.ok(Buffer.byteLength(JSON.stringify(all)) < 256000);
  const csv = await analytics.csv(owner, 'all', 'UTC', now);
  assert.match(csv, /2025-01-01,3,1,30000,6,all,UTC/);
  assert.match(csv, /2025-01-11,0,0,0,0,all,UTC/);
  assert.match(csv, /2026-10-11,4,1,60000,4,all,UTC/);
  await transcripts.remove(owner, '2026-10-11');
  const deleted = await analytics.get(owner, '30d', 'UTC', now);
  assert.equal(deleted.streaks.current, 1);
  assert.equal(deleted.summary.dictations, 1);
});

test('timezone validation rejects SQL-like input and long-history trend payloads stay bounded', async () => {
  const { analyticsQuerySchema } =
    await import('../apps/api/src/modules/analytics/analytics.validation');
  assert.equal(
    analyticsQuerySchema.safeParse({ timezone: 'Asia/Kolkata', range: 'all' }).success,
    true,
  );
  assert.equal(
    analyticsQuerySchema.safeParse({ timezone: "UTC'); DROP TABLE dictation;--" }).success,
    false,
  );
  assert.equal(analyticsQuerySchema.safeParse({ timezone: 'Mars/Olympus' }).success, false);
  const { trend } = await import('../apps/api/src/modules/analytics/analytics.utils');
  const data = trend([
    { date: '1970-01-01', dictations: 1, words: 100, durationMs: 60000, wordsPerMinute: 100 },
    { date: '2026-10-11', dictations: 1, words: 200, durationMs: 120000, wordsPerMinute: 100 },
  ]);
  assert.equal(data.bucket, 'year');
  assert.ok(data.days.length <= 120);
  assert.equal(
    data.days.reduce((n, d) => n + d.words, 0),
    300,
  );
  assert.equal(data.days[1]?.words, 0);
});
