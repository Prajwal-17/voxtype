import {
  localDate,
  shiftDate,
  dailyCsv,
  type AnalyticsRange,
  type Analytics,
} from '@voxtype/shared/analytics';
import { speechCost } from './analytics.costs';
import { createAnalyticsRepository } from './analytics.repository';
import { startOfRange, wordsPerMinute, fillDays, streaks, trend } from './analytics.utils';
export function createAnalyticsService(database: D1Database) {
  const repository = createAnalyticsRepository(database);
  return {
    async get(
      userId: string,
      range: AnalyticsRange,
      timezone = 'UTC',
      now = Date.now(),
    ): Promise<Analytics> {
      const today = localDate(now, timezone),
        since = startOfRange(range, now, timezone);
      const start = range === 'all' ? null : shiftDate(today, range === '7d' ? -6 : -29);
      const [all, usage] = await Promise.all([
        repository.getDaily(userId, timezone, now),
        repository.getCleanupUsage(userId, since, now),
      ]);
      const selected = all.filter((d) => (!start || d.date >= start) && d.date <= today);
      const summary = selected.reduce(
        (s, d) => ({
          dictations: s.dictations + d.dictations,
          totalWords: s.totalWords + d.words,
          totalDurationMs: s.totalDurationMs + d.durationMs,
        }),
        { dictations: 0, totalWords: 0, totalDurationMs: 0 },
      );
      const cost = speechCost(summary.totalDurationMs);
      const weekday = (new Date(`${today}T12:00Z`).getUTCDay() + 6) % 7;
      const activityEnd = shiftDate(today, 6 - weekday),
        activityStart = shiftDate(activityEnd, -97);
      const periodRows = start ? fillDays(selected, start, today) : selected;
      return {
        range,
        timezone,
        period: { start: start ?? selected[0]?.date ?? null, end: today },
        summary: {
          ...summary,
          averageDurationMs: summary.dictations
            ? Math.round(summary.totalDurationMs / summary.dictations)
            : 0,
          averageWordsPerMinute: wordsPerMinute(summary.totalWords, summary.totalDurationMs),
          activeDays: selected.length,
        },
        streaks: streaks(all, today),
        activity: {
          start: activityStart,
          end: activityEnd,
          days: fillDays(all, activityStart, activityEnd),
        },
        trend: trend(periodRows),
        costs: {
          currency: 'USD',
          deepgramMin: cost.min,
          deepgramMax: cost.max,
          deepseek: usage?.cost ?? 0,
          cleanupRequests: usage?.requests ?? 0,
          unmeteredRequests: usage?.unmetered ?? 0,
          estimated: true,
        },
        daily:
          range === 'all' ? selected.filter((d) => d.date >= shiftDate(today, -97)) : periodRows,
      };
    },
    async csv(userId: string, range: AnalyticsRange, timezone: string, now = Date.now()) {
      const all = await repository.getDaily(userId, timezone, now),
        today = localDate(now, timezone);
      const start = range === 'all' ? null : shiftDate(today, range === '7d' ? -6 : -29);
      const selected = all.filter((d) => (!start || d.date >= start) && d.date <= today);
      return dailyCsv(
        start
          ? fillDays(selected, start, today)
          : selected.length
            ? fillDays(selected, selected[0]!.date, today)
            : [],
        range,
        timezone,
      );
    },
  };
}
