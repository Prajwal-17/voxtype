import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transcriptEntries } from '../apps/mobile/src/lib/transcript-library';
import type {
  Dictation,
  LocalRecording,
} from '../apps/mobile/modules/voxtype-native/src/VoxTypeNative.types';

const transcript: Dictation = {
  id: 'take-1',
  userId: 'user-1',
  text: 'Cleaned transcript',
  originalText: null,
  createdAt: 1000,
  updatedAt: 1000,
  durationMs: 2000,
  wordCount: 2,
  delivery: 'saved',
  audioFile: null,
};
const recording: LocalRecording = {
  id: 'take-1',
  originalText: 'Raw original',
  createdAt: 1000,
  durationMs: 2000,
  audioAvailable: true,
};

test('mobile combines transcripts and recent recordings once, including unfinished takes', () => {
  const rows = transcriptEntries(
    [{ ...transcript, id: 'older', createdAt: 1 }, transcript, transcript],
    [recording, { ...recording, id: 'unfinished', originalText: '', createdAt: 2000 }],
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ['unfinished', 'take-1', 'older'],
  );
  assert.equal(rows[0]?.transcript, undefined);
  assert.equal(rows[0]?.wordCount, 0);
  assert.equal(rows[1]?.text, 'Cleaned transcript');
  assert.equal(rows[1]?.local?.id, 'take-1');
  assert.equal(rows[2]?.local, undefined);
});
test('mobile searches cleaned text and recent originals in the same list', () => {
  for (const query of ['cleaned', 'RAW']) {
    assert.equal(transcriptEntries([transcript], [recording], query)[0]?.id, 'take-1');
  }
  assert.equal(transcriptEntries([transcript], [recording], 'not here').length, 0);
});
