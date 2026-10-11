export type AnalyticsRange = '7d' | '30d' | 'all';
export type DailyActivity = {
  date: string;
  dictations: number;
  words: number;
  durationMs: number;
  wordsPerMinute: number;
};
export type Analytics = {
  range: AnalyticsRange;
  timezone: string;
  period: { start: string | null; end: string };
  summary: {
    dictations: number;
    totalWords: number;
    totalDurationMs: number;
    averageWordsPerMinute: number;
    averageDurationMs: number;
    activeDays: number;
  };
  streaks: { current: number; longest: number };
  activity: { start: string; end: string; days: DailyActivity[] };
  trend: { bucket: 'day' | 'week' | 'month' | 'year'; days: DailyActivity[] };
  costs: {
    currency: 'USD';
    deepgramMin: number;
    deepgramMax: number;
    deepseek: number;
    cleanupRequests: number;
    unmeteredRequests: number;
    estimated: true;
  };
  /** Compatibility field: daily values for the most recent 98 days of the selected period. */
  daily: DailyActivity[];
};
export const emptyAnalytics: Analytics = {
  range: '30d',
  timezone: 'UTC',
  period: { start: null, end: '' },
  summary: {
    dictations: 0,
    totalWords: 0,
    totalDurationMs: 0,
    averageWordsPerMinute: 0,
    averageDurationMs: 0,
    activeDays: 0,
  },
  streaks: { current: 0, longest: 0 },
  activity: { start: '', end: '', days: [] },
  trend: { bucket: 'day', days: [] },
  costs: {
    currency: 'USD',
    deepgramMin: 0,
    deepgramMax: 0,
    deepseek: 0,
    cleanupRequests: 0,
    unmeteredRequests: 0,
    estimated: true,
  },
  daily: [],
};
export const money = (value: number) =>
  value > 0 && value < 0.01 ? '<$0.01' : `$${value.toFixed(2)}`;
export function moneyRange(min: number, max: number) {
  const lower = money(min),
    upper = money(max);
  return lower === upper ? lower : `${lower}–${upper}`;
}
export function clientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
export function localDate(time: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(time);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function activityLevel(words: number): 0 | 1 | 2 | 3 | 4 {
  return words <= 0 ? 0 : words < 100 ? 1 : words < 300 ? 2 : words < 700 ? 3 : 4;
}
export function activityDescription(day: DailyActivity): string {
  return `${day.date}: ${day.words.toLocaleString()} words, ${day.dictations} dictations, ${(day.durationMs / 60000).toFixed(1)} minutes`;
}
export const minutes = (ms: number) => (ms / 60_000).toFixed(1);
export const speed = (words: number, duration: number) =>
  duration > 0 ? Math.round((words * 60_000) / duration) : 0;
export function dailyCsv(days: DailyActivity[], range: AnalyticsRange, timezone: string): string {
  return (
    [
      'date,words,dictations,duration_ms,words_per_minute,range,timezone',
      ...days.map((d) =>
        [d.date, d.words, d.dictations, d.durationMs, d.wordsPerMinute, range, timezone].join(','),
      ),
    ].join('\r\n') + '\r\n'
  );
}

/** Empty, read-only browser preview with the same calendar geometry as a successful API response. */
export function emptyPeriod(range: AnalyticsRange, timezone: string, now = Date.now()): Analytics {
  const today = localDate(now, timezone),
    weekday = (new Date(`${today}T12:00Z`).getUTCDay() + 6) % 7;
  const end = shiftDate(today, 6 - weekday),
    start = shiftDate(end, -97);
  const day = (date: string): DailyActivity => ({
    date,
    dictations: 0,
    words: 0,
    durationMs: 0,
    wordsPerMinute: 0,
  });
  const count = range === '7d' ? 7 : range === '30d' ? 30 : 0;
  const daily = Array.from({ length: count }, (_, i) => day(shiftDate(today, i - count + 1)));
  return {
    ...emptyAnalytics,
    range,
    timezone,
    period: { start: daily[0]?.date ?? null, end: today },
    activity: { start, end, days: Array.from({ length: 98 }, (_, i) => day(shiftDate(start, i))) },
    daily,
    trend: { bucket: 'day', days: daily },
  };
}
