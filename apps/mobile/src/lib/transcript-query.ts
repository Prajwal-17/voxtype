import type {
  Dictation,
  TranscriptPage,
} from '../../modules/voxtype-native/src/VoxTypeNative.types';

type State = {
  items: Dictation[];
  cursor: string | null;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
};
/** A refresh replaces pages atomically; it never blanks a visible list or loses its depth. */
export function createTranscriptQuery(
  fetchPage: (cursor: string | null) => Promise<TranscriptPage>,
) {
  let state: State = { items: [], cursor: null, loading: true, refreshing: false, error: false };
  let hasResult = false;
  let sequence = 0,
    pages = 1;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  async function refresh() {
    const request = ++sequence;
    publish({ loading: !hasResult, refreshing: true, error: false });
    try {
      let cursor: string | null = null;
      const items: Dictation[] = [];
      for (let index = 0; index < pages; index++) {
        const page = await fetchPage(cursor);
        if (request !== sequence) return;
        items.push(...page.items.filter((row) => !items.some((item) => item.id === row.id)));
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      hasResult = true;
      publish({ items, cursor });
    } catch {
      if (request === sequence) publish({ error: true });
    } finally {
      if (request === sequence) publish({ loading: false, refreshing: false });
    }
  }
  async function more() {
    if (state.loading || state.refreshing || !state.cursor) return;
    const request = ++sequence;
    publish({ loading: true, error: false });
    try {
      const page = await fetchPage(state.cursor);
      if (request !== sequence) return;
      pages++;
      publish({
        items: [
          ...state.items,
          ...page.items.filter((row) => !state.items.some((item) => item.id === row.id)),
        ],
        cursor: page.nextCursor,
      });
    } catch {
      if (request === sequence) publish({ error: true });
    } finally {
      if (request === sequence) publish({ loading: false });
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    more,
    cancel: () => {
      sequence++;
    },
  };
}
