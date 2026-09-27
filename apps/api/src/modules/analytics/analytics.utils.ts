import type { AnalyticsRange } from './analytics.types';

const rangeDays: Record<Exclude<AnalyticsRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
};

export function startOfRange(range: AnalyticsRange, now = Date.now()): Date | null {
  if (range === 'all') return null;
  return new Date(now - rangeDays[range] * 86_400_000);
}

export function wordsPerMinute(words: number, durationMs: number): number {
  if (words <= 0 || durationMs <= 0) return 0;
  return Math.round((words * 60_000) / durationMs);
}
