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
export type LibraryView = 'transcripts' | 'recordings';

/** One row per take. Audio and originals belong to the transcript with the same ID. */
export function libraryItems(
  history: HistoryItem[],
  recordings: LocalRecording[],
  view: LibraryView,
  search = '',
): LibraryItem[] {
  const transcripts = new Map(history.map((item) => [item.id, item]));
  const audio = new Map(recordings.map((item) => [item.id, item]));
  const rows = [
    ...new Map(
      (view === 'transcripts' ? history : recordings).map((row) => [row.id, row]),
    ).values(),
  ];
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
        (view === 'recordings' && row.recording?.originalText.toLocaleLowerCase().includes(query)),
    );
}
