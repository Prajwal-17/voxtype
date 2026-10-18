import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as tick } from 'node:timers/promises';
import { RequestCache } from '../packages/shared/request-cache';
import { createDataEvents } from '../packages/shared/data-events';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
test('home, insights and interrupted navigation share one request until expiry', async () => {
  let now = 1000,
    calls = 0;
  const cache = new RequestCache<number>(120_000, 32, () => now);
  const response = deferred<number>();
  const fetcher = () => {
    calls++;
    return response.promise;
  };
  const home = cache.get('account/api/30d/UTC/day', fetcher);
  const insights = cache.get('account/api/30d/UTC/day', fetcher);
  assert.equal(home, insights);
  response.resolve(7);
  assert.equal(await home, 7);
  assert.equal(await insights, 7);
  for (let navigation = 0; navigation < 10; navigation++)
    assert.equal(await cache.get('account/api/30d/UTC/day', fetcher), 7);
  assert.equal(calls, 1);
  now += 120_000;
  await cache.get('account/api/30d/UTC/day', fetcher);
  assert.equal(calls, 2);
});
test('account changes and invalidation during a request cannot restore obsolete cache entries', async () => {
  const cache = new RequestCache<string>();
  const old = deferred<string>();
  const first = cache.get('owner', () => old.promise);
  cache.clear();
  assert.equal(await cache.get('other', async () => 'other data'), 'other data');
  assert.equal(await cache.get('owner', async () => 'fresh data'), 'fresh data');
  old.resolve('obsolete');
  await first;
  assert.equal(await cache.get('owner', async () => 'unexpected'), 'fresh data');
  assert.equal(await cache.get('other', async () => 'unexpected'), 'other data');
});
test('cache keys isolate account, API, period, timezone and calendar date; failure can retry', async () => {
  const cache = new RequestCache<number>();
  let calls = 0;
  for (const part of [
    'owner/api/30d/UTC/day',
    'other/api/30d/UTC/day',
    'owner/dev/30d/UTC/day',
    'owner/api/7d/UTC/day',
    'owner/api/30d/Asia-Kolkata/day',
    'owner/api/30d/UTC/next-day',
  ])
    await cache.get(part, async () => ++calls);
  assert.equal(calls, 6);
  await assert.rejects(
    cache.get('failure', async () => {
      throw new Error('offline');
    }),
  );
  assert.equal(await cache.get('failure', async () => 42), 42);
});
test('cache memory stays bounded across repeated searches and ranges', async () => {
  const cache = new RequestCache<number>(120_000, 2);
  await cache.get('one', async () => 1);
  await cache.get('two', async () => 2);
  await cache.get('three', async () => 3);
  assert.equal(await cache.get('one', async () => 4), 4);
});
test('recording and clipboard history changes do not fetch insights; cloud changes coalesce once', async () => {
  const calls: string[] = [];
  const events = createDataEvents((key) => calls.push(key), 5);
  for (let change = 0; change < 10; change++) events.changed('history');
  await tick(20);
  assert.deepEqual(calls, ['history', 'local-recordings']);
  calls.length = 0;
  for (let change = 0; change < 10; change++) {
    events.changed('history');
    events.changed('analytics');
  }
  await tick(20);
  assert.deepEqual(calls, ['history', 'local-recordings', 'analytics']);
  calls.length = 0;
  events.changed('analytics');
  events.dispose();
  await tick(20);
  assert.deepEqual(calls, []);
});
