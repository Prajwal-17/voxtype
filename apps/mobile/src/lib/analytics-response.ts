import type { Analytics } from '@voxtype/shared/analytics';

export type MobileAnalytics = Analytics;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const days = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.every(
    (day: unknown) =>
      record(day) &&
      typeof day.date === 'string' &&
      count(day.dictations) &&
      count(day.words) &&
      count(day.durationMs) &&
      count(day.wordsPerMinute),
  );

/** Reject an older/incompatible API before the restored Insights UI reads its fields. */
export function parseAnalyticsResponse(body: unknown): Analytics {
  const invalid = () =>
    new Error('Analytics response is incompatible. Update the API and try again.');
  if (!record(body) || !record(body.data)) throw invalid();
  const data = body.data;
  if (!['7d', '30d', 'all'].includes(String(data.range)) || !record(data.summary)) throw invalid();
  const summary = data.summary;
  if (
    !['dictations', 'totalWords', 'totalDurationMs', 'averageWordsPerMinute', 'activeDays'].every(
      (key) => count(summary[key]),
    ) ||
    !count(summary.averageDurationMs)
  )
    throw invalid();
  if (
    typeof data.timezone !== 'string' ||
    !record(data.period) ||
    !(data.period.start === null || typeof data.period.start === 'string') ||
    typeof data.period.end !== 'string'
  )
    throw invalid();
  if (!record(data.streaks) || !count(data.streaks.current) || !count(data.streaks.longest))
    throw invalid();
  if (
    !record(data.activity) ||
    typeof data.activity.start !== 'string' ||
    typeof data.activity.end !== 'string' ||
    !days(data.activity.days)
  )
    throw invalid();
  if (
    !record(data.trend) ||
    !['day', 'week', 'month', 'year'].includes(String(data.trend.bucket)) ||
    !days(data.trend.days) ||
    !days(data.daily)
  )
    throw invalid();
  if (
    !record(data.costs) ||
    data.costs.currency !== 'USD' ||
    data.costs.estimated !== true ||
    !['deepgramMin', 'deepgramMax', 'deepseek', 'cleanupRequests', 'unmeteredRequests'].every(
      (key) => count((data.costs as Record<string, unknown>)[key]),
    )
  )
    throw invalid();
  return data as Analytics;
}
