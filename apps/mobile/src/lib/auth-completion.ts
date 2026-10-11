/** Both the browser session and Expo Router receive Android's same deep link. */
export function createAuthCompletion<T>(dependencies: {
  pendingState: () => Promise<string | null>;
  exchange: (grant: string) => Promise<T>;
}) {
  let completed: { state: string; grant: string; result: Promise<T> } | undefined;
  return {
    resultFor(state: string) {
      return completed?.state === state ? completed.result : undefined;
    },
    reset() {
      completed = undefined;
    },
    async complete(
      this: void,
      state: string | undefined,
      grant: string | undefined,
      error?: string,
    ) {
      if (!state || state !== (await dependencies.pendingState())) {
        throw new Error('Sign-in response could not be verified. Try again.');
      }
      if (error) throw new Error('This Google account could not sign in.');
      if (!grant) throw new Error('Sign-in link expired. Try again.');
      if (completed?.state === state && completed.grant === grant) return completed.result;
      // Retain the result until the next attempt, including late route mounts.
      const result = dependencies.exchange(grant);
      completed = { state, grant, result };
      return result;
    },
  };
}
