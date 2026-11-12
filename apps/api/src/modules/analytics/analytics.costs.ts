// USD list-price estimates, verified 2026-11-12. See docs/ANALYTICS.md.
// Range covers Nova-3 mono through multilingual + keyterm prompting.
export function speechCost(durationMs: number) {
  const minutes = Math.max(0, durationMs) / 60_000;
  return { min: minutes * 0.0048, max: minutes * 0.0071 };
}
export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens?: number;
  /** Actual or list cost reported by OpenCode, when present. */
  cost_usd?: number;
};
export function parseUsage(value: unknown): TokenUsage | null {
  if (!value || typeof value !== 'object') return null;
  const usage = value as Record<string, unknown>;
  const valid = (v: unknown): v is number =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  if (!valid(usage.prompt_tokens) || !valid(usage.completion_tokens)) return null;
  const details =
    usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
      ? (usage.prompt_tokens_details as Record<string, unknown>)
      : null;
  const cached = details?.cached_tokens ?? usage.prompt_cache_hit_tokens ?? 0;
  if (!valid(cached) || cached > usage.prompt_tokens) return null;
  const opencode =
    usage.opencode && typeof usage.opencode === 'object'
      ? (usage.opencode as Record<string, unknown>)
      : null;
  // Go reports cost 0 because usage is included in the plan; list_cost and
  // allowance still show what the request was worth.
  const reported = opencode?.list_cost ?? opencode?.allowance ?? usage.cost;
  const costUsd =
    typeof reported === 'number' && Number.isFinite(reported) && reported >= 0
      ? reported
      : undefined;
  return {
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    cached_tokens: cached,
    ...(costUsd === undefined ? {} : { cost_usd: costUsd }),
  };
}
// OpenCode reports the per-request list cost. Fall back to conservative Flash
// peak rates only when that value is missing from the usage payload.
export function cleanupCost(usage: TokenUsage) {
  if (usage.cost_usd !== undefined) return usage.cost_usd;
  const hit = usage.cached_tokens ?? 0;
  return (
    ((usage.prompt_tokens - hit) * 0.3 + hit * 0.006 + usage.completion_tokens * 1.2) / 1_000_000
  );
}
