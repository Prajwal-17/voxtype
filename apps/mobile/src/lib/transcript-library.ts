import type {
  Dictation,
  LocalRecording,
} from '../../modules/voxtype-native/src/VoxTypeNative.types';

export type TranscriptEntry = {
  id: string;
  text: string;
  createdAt: number;
  durationMs: number;
  wordCount: number;
  local?: LocalRecording;
  transcript?: Dictation;
};

/** One list, with saved audio attached by take ID and unfinished takes kept recoverable. */
export function transcriptEntries(
  transcripts: Dictation[],
  recordings: LocalRecording[],
  search = '',
): TranscriptEntry[] {
  const textById = new Map(transcripts.map((item) => [item.id, item]));
  const audioById = new Map(recordings.map((item) => [item.id, item]));
  const rows = [
    ...new Map([...recordings, ...transcripts].map((item) => [item.id, item])).values(),
  ];
  const query = search.trim().toLocaleLowerCase();
  return rows
    .map((item) => {
      const transcript = textById.get(item.id);
      const local = audioById.get(item.id);
      const text = transcript?.text ?? local?.originalText ?? '';
      return {
        id: item.id,
        text,
        createdAt: item.createdAt,
        durationMs: item.durationMs,
        wordCount: transcript?.wordCount ?? text.trim().split(/\s+/).filter(Boolean).length,
        local,
        transcript,
      };
    })
    .filter(
      (item) =>
        !query ||
        item.text.toLocaleLowerCase().includes(query) ||
        !!item.local?.originalText.toLocaleLowerCase().includes(query),
    )
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}
