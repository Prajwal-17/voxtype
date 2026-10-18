import assert from 'node:assert/strict';
import { test } from 'node:test';
import { libraryItems } from '../apps/desktop/src/lib/transcript-library';
import type { HistoryItem, LocalRecording } from '../apps/desktop/src/lib/types';
const transcript: HistoryItem = {
  id: 'take-1',
  text: 'Cleaned transcript',
  createdAt: 1000,
  durationMs: 2000,
  words: 2,
  delivery: 'saved',
};
const recording: LocalRecording = {
  id: 'take-1',
  originalText: 'Raw original',
  createdAt: 1000,
  durationMs: 2000,
  audioFile: '/private/take-1.wav',
};

test('the library joins audio and original text to the matching transcript once', () => {
  const rows = libraryItems([transcript, transcript], [recording], 'transcripts');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.text, transcript.text);
  assert.equal(rows[0]?.recording?.audioFile, recording.audioFile);
  assert.equal(rows[0]?.recording?.originalText, recording.originalText);
});
test('recordings include failed takes without creating duplicate transcript rows', () => {
  const failed = { ...recording, id: 'failed', originalText: 'An unfinished thought' };
  assert.equal(libraryItems([transcript], [recording, failed], 'transcripts').length, 1);
  const rows = libraryItems([transcript], [recording, failed], 'recordings');
  assert.equal(rows.length, 2);
  assert.equal(rows[1]?.text, 'An unfinished thought');
  assert.equal(rows[1]?.words, 3);
  assert.equal(rows[1]?.transcript, undefined);
});
test('recordings search includes originals and cleaned text while keeping audio with its own take', () => {
  assert.equal(libraryItems([transcript], [recording], 'recordings', 'RAW')[0]?.id, 'take-1');
  assert.equal(libraryItems([transcript], [recording], 'recordings', 'cleaned')[0]?.id, 'take-1');
  assert.equal(libraryItems([transcript], [recording], 'transcripts', 'raw').length, 0);
  const missing = libraryItems([{ ...transcript, id: 'cloud-only' }], [recording], 'transcripts');
  assert.equal(missing[0]?.recording, undefined);
});
