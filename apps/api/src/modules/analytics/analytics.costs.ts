// USD list-price estimates, verified 2026-10-02. See docs/ANALYTICS.md.
// Range covers Nova-3 mono through multilingual + keyterm prompting.
export function speechCost(durationMs: number) {
  const minutes = Math.max(0, durationMs) / 60_000;
  return { min: minutes * 0.0048, max: minutes * 0.0071 };
}
export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_cache_hit_tokens?: number;
};
export function parseUsage(value: unknown): TokenUsage | null {
  if (!value || typeof value !== 'object') return null;
  const usage = value as Record<string, unknown>;
  const valid = (v: unknown): v is number =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  if (!valid(usage.prompt_tokens) || !valid(usage.completion_tokens)) return null;
  const hit = usage.prompt_cache_hit_tokens ?? 0;
  if (!valid(hit) || hit > usage.prompt_tokens) return null;
  return {
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    prompt_cache_hit_tokens: hit,
  };
}
// Peak rates provide a conservative estimate independent of regional holiday calendars.
export function cleanupCost(usage: TokenUsage) {
  const hit = usage.prompt_cache_hit_tokens ?? 0;
  return (
    ((usage.prompt_tokens - hit) * 0.3 + hit * 0.006 + usage.completion_tokens * 1.2) / 1_000_000
  );
}
