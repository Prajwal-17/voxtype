import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioBufferQueue } from '../src/audio/buffer.ts';

test('buffers microphone chunks in order and flushes once the socket opens', () => {
  const queue = new AudioBufferQueue(10);
  const sent: number[] = [];
  queue.push(new Uint8Array([1, 2]));
  queue.push(new Uint8Array([3]));
  assert.equal(queue.bufferedBytes, 3);
  queue.open(bytes => sent.push(...bytes));
  assert.deepEqual(sent, [1, 2, 3]);
  assert.equal(queue.bufferedBytes, 0);
  queue.push(new Uint8Array([4, 5]));
  assert.deepEqual(sent, [1, 2, 3, 4, 5]);
});

test('rejects an unbounded disconnected stream and can discard it', () => {
  const queue = new AudioBufferQueue(3);
  queue.push(new Uint8Array([1, 2]));
  assert.throws(() => queue.push(new Uint8Array([3, 4])), /taking too long/);
  queue.clear();
  assert.equal(queue.bufferedBytes, 0);
  assert.equal(queue.isOpen, false);
});

test('does not silently accept a second socket', () => {
  const queue = new AudioBufferQueue();
  queue.open(() => {});
  assert.throws(() => queue.open(() => {}), /already connected/);
});
