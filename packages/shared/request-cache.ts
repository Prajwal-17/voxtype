/** In-memory, bounded request sharing. Account changes clear both values and in-flight ownership. */
export class RequestCache<T> {
  private entries = new Map<string, { value?: T; expires: number; pending?: Promise<T> }>();
  constructor(
    private ttl = 120_000,
    private limit = 32,
    private now = Date.now,
  ) {}
  clear() {
    this.entries.clear();
  }
  get(key: string, fetcher: () => Promise<T>): Promise<T> {
    const previous = this.entries.get(key);
    if (previous?.pending) return previous.pending;
    if (previous && previous.expires > this.now() && previous.value !== undefined)
      return Promise.resolve(previous.value);
    const entry: { value?: T; expires: number; pending?: Promise<T> } = { expires: 0 };
    const pending = Promise.resolve()
      .then(fetcher)
      .then(
        (value) => {
          if (this.entries.get(key) === entry) {
            entry.value = value;
            entry.expires = this.now() + this.ttl;
            entry.pending = undefined;
          }
          return value;
        },
        (error) => {
          if (this.entries.get(key) === entry) this.entries.delete(key);
          throw error;
        },
      );
    entry.pending = pending;
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
    return pending;
  }
}
