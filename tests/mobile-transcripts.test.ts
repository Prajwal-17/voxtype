import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranscriptQuery } from '../apps/mobile/src/lib/transcript-query';
import type {
  Dictation,
  TranscriptPage,
} from '../apps/mobile/modules/voxtype-native/src/VoxTypeNative.types';
const row = (id: string, text = id): Dictation => ({
  id,
  text,
  userId: 'user',
  originalText: null,
  createdAt: 1,
  updatedAt: 1,
  durationMs: 3000,
  wordCount: 1,
  delivery: 'saved',
  audioFile: null,
});
const page = (ids: string[], nextCursor: string | null = null): TranscriptPage => ({
  items: ids.map((id) => row(id)),
  nextCursor,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
test('history refresh retains visible transcripts and never flashes the initial loader', async () => {
  const pending = deferred<TranscriptPage>();
  let calls = 0;
  const query = createTranscriptQuery(() =>
    ++calls === 1 ? Promise.resolve(page(['one'])) : pending.promise,
  );
  await query.refresh();
  const states: ReturnType<typeof query.getSnapshot>[] = [];
  query.subscribe(() => states.push(query.getSnapshot()));
  const refreshing = query.refresh();
  assert.equal(query.getSnapshot().items[0]?.id, 'one');
  assert.equal(query.getSnapshot().loading, false);
  pending.resolve(page(['two', 'one']));
  await refreshing;
  assert(states.every((state) => state.items.length > 0 && !state.loading));
  assert.deepEqual(
    query.getSnapshot().items.map((item) => item.id),
    ['two', 'one'],
  );
});
test('a failed background refresh keeps content and clears refreshing state', async () => {
  let fail = false;
  const query = createTranscriptQuery(async () => {
    if (fail) throw new Error('offline');
    return page(['one']);
  });
  await query.refresh();
  fail = true;
  await query.refresh();
  assert.equal(query.getSnapshot().error, true);
  assert.equal(query.getSnapshot().items[0]?.id, 'one');
  assert.equal(query.getSnapshot().refreshing, false);
});
test('refresh preserves loaded page depth and deduplicates overlapping pages', async () => {
  const calls: (string | null)[] = [];
  const query = createTranscriptQuery(async (cursor) => {
    calls.push(cursor);
    return cursor ? page(['one', 'two']) : page(['one'], 'next');
  });
  await query.refresh();
  await query.more();
  await query.refresh();
  assert.deepEqual(calls, [null, 'next', null, 'next']);
  assert.deepEqual(
    query.getSnapshot().items.map((item) => item.id),
    ['one', 'two'],
  );
});
test('stale requests cannot replace newer refreshes or publish after cancellation', async () => {
  const pending = deferred<TranscriptPage>();
  let calls = 0;
  const query = createTranscriptQuery(() =>
    ++calls === 1 ? pending.promise : Promise.resolve(page(['new'])),
  );
  const old = query.refresh();
  await query.refresh();
  pending.resolve(page(['old']));
  await old;
  assert.equal(query.getSnapshot().items[0]?.id, 'new');
  const cancelled = deferred<TranscriptPage>();
  const second = createTranscriptQuery(() => cancelled.promise);
  const loading = second.refresh();
  second.cancel();
  cancelled.resolve(page(['private']));
  await loading;
  assert.equal(second.getSnapshot().items.length, 0);
});
test('pagination failure can retry without dropping earlier rows', async () => {
  let fail = true;
  const query = createTranscriptQuery(async (cursor) => {
    if (!cursor) return page(['one'], 'next');
    if (fail) throw new Error('offline');
    return page(['two']);
  });
  await query.refresh();
  await query.more();
  assert.equal(query.getSnapshot().items.length, 1);
  fail = false;
  await query.more();
  assert.deepEqual(
    query.getSnapshot().items.map((item) => item.id),
    ['one', 'two'],
  );
});

test('an already-loaded empty list also refreshes without flashing a loader', async () => {
  const pending = deferred<TranscriptPage>();
  let calls = 0;
  const query = createTranscriptQuery(() =>
    ++calls === 1 ? Promise.resolve(page([])) : pending.promise,
  );
  await query.refresh();
  const refreshing = query.refresh();
  assert.equal(query.getSnapshot().loading, false);
  pending.resolve(page([]));
  await refreshing;
});
