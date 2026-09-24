import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PcmDecoder, pcmLevel } from '../src/audio/pcm.ts';
import { ParecCapture, type ProcessEvent } from '../src/audio/parec.ts';

test('split and coalesced native events preserve non-UTF8 PCM bytes and final tail', () => {
  const input = Buffer.from([0, 255, 128, 0, 34, 192, 255, 127]);
  const output: Uint8Array[] = []; let ended = false;
  const decoder = new PcmDecoder(bytes => output.push(bytes), () => { ended = true; });
  const wire = input.subarray(0, 6).toString('base64') + '\n' + input.subarray(6).toString('base64') + '\nFLOW_END\n';
  for (let i = 0; i < wire.length; i += 3) decoder.push(wire.slice(i, i + 3));
  decoder.complete(); assert.ok(ended); assert.deepEqual(Buffer.concat(output), input);
});
test('rejects malformed, oversized and truncated transport', () => {
  for (const input of ['!!!\n', 'AA==\n', 'A'.repeat(4097)]) {
    assert.throws(() => new PcmDecoder(() => {}, () => {}).push(input));
  }
  const decoder = new PcmDecoder(() => {}, () => {});
  decoder.push('AAA=\n'); assert.throws(() => decoder.complete());
});
test('level distinguishes silence from signed full-scale PCM', () => {
  assert.equal(pcmLevel(new Uint8Array(4)), 0);
  assert.ok(pcmLevel(new Uint8Array([0, 128, 255, 127])) > .99);
});
function fixture() {
  let handler: (event: ProcessEvent) => void = () => {};
  let releaseSpawn!: (value: {id: number}) => void;
  let removed = false;
  const sent: string[] = []; const audio: Uint8Array[] = []; const errors: Error[] = [];
  const emit = (action: string, data: string | number) => handler({ id: 7, action, data });
  const capture = new ParecCapture({
    listen: async callback => { handler = callback; return async () => { removed = true; }; },
    spawn: () => new Promise(resolve => { releaseSpawn = resolve; }),
    update: async (_id, action, data) => { sent.push(data ?? action); },
  }, 'script', bytes => audio.push(bytes), error => errors.push(error));
  return { capture, emit, sent, audio, errors, spawn: () => releaseSpawn({id: 7}), removed: () => removed };
}
test('cancel during asynchronous spawn stops without starting the microphone', async () => {
  const f = fixture(); const starting = f.capture.start();
  await Promise.resolve(); const stopping = f.capture.stop(true);
  f.spawn(); await starting;
  assert.deepEqual(f.sent, ['stop\n']);
  f.emit('stdOut', 'AAA=\nFLOW_END\n'); f.emit('exit', 0);
  await stopping; assert.equal(f.audio.length, 0); assert.ok(f.removed());
});
test('finish drains tail; stale events and duplicate stop do not restart capture', async () => {
  const f = fixture(); const starting = f.capture.start(); await Promise.resolve(); f.spawn(); await starting;
  const stopping = f.capture.stop(); const again = f.capture.stop();
  f.emit('stdOut', 'AAA=\nFLOW_END\n'); f.emit('exit', 0);
  await Promise.all([stopping, again]);
  f.emit('stdOut', 'AAA=\n');
  assert.deepEqual(f.sent, ['start\n', 'stop\n']); assert.equal(f.audio.length, 1);
});
test('capture failure reaches the UI and removes the listener', async () => {
  const f = fixture(); const starting = f.capture.start(); await Promise.resolve(); f.spawn(); await starting;
  f.emit('stdErr', 'Missing parec.'); f.emit('exit', 127);
  assert.equal(f.errors[0]?.message, 'Missing parec.'); assert.ok(f.removed());
  await assert.rejects(f.capture.stop(), /Missing parec/);
});
