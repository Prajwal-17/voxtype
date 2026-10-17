/** Coalesce a native mutation burst, keeping local history separate from cloud analytics. */
export function createDataEvents(invalidate: (key: string) => void, delay = 180) {
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    changed(kind: 'history' | 'analytics') {
      if (kind === 'history') {
        pending.add('history');
        pending.add('local-recordings');
      } else pending.add('analytics');
      clearTimeout(timer);
      timer = setTimeout(() => {
        const keys = [...pending];
        pending.clear();
        keys.forEach(invalidate);
      }, delay);
    },
    dispose() {
      clearTimeout(timer);
      pending.clear();
    },
  };
}
