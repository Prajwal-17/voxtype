import type { HistoryItem, LocalRecording } from './types';

export type LibraryItem = {
  id: string;
  text: string;
  createdAt: number;
  durationMs: number;
  words: number;
  transcript?: HistoryItem;
  recording?: LocalRecording;
};

/** One row per take. Audio and originals belong to the transcript with the same ID. */
export function libraryItems(
  history: HistoryItem[],
  recordings: LocalRecording[],
  search = '',
): LibraryItem[] {
  const transcripts = new Map(history.map((item) => [item.id, item]));
  const audio = new Map(recordings.map((item) => [item.id, item]));
  const rows = [...new Map([...recordings, ...history].map((row) => [row.id, row])).values()];
  const query = search.trim().toLocaleLowerCase();
  return rows
    .map((row): LibraryItem => {
      const transcript = transcripts.get(row.id);
      const recording = audio.get(row.id);
      const text = transcript?.text ?? recording?.originalText ?? '';
      return {
        id: row.id,
        text,
        createdAt: row.createdAt,
        durationMs: row.durationMs,
        words: transcript?.words ?? (text.trim() ? text.trim().split(/\s+/u).length : 0),
        transcript,
        recording,
      };
    })
    .filter(
      (row) =>
        !query ||
        row.text.toLocaleLowerCase().includes(query) ||
        row.recording?.originalText.toLocaleLowerCase().includes(query),
    )
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}
