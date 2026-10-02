import { speechCost } from './analytics.costs';
import { createAnalyticsRepository } from './analytics.repository';
import type { AnalyticsRange, AnalyticsResponse } from './analytics.types';
import { startOfRange, wordsPerMinute } from './analytics.utils';

export function createAnalyticsService(database: D1Database) {
  const repository = createAnalyticsRepository(database);

  return {
    async get(userId: string, range: AnalyticsRange): Promise<AnalyticsResponse> {
      const since = startOfRange(range);
      const [summary, dailyRows, usage] = await Promise.all([
        repository.getSummary(userId, since),
        repository.getDaily(userId, since),
        repository.getCleanupUsage(userId, since),
      ]);

      const cost = speechCost(summary.totalDurationMs);
      return {
        range,
        summary: {
          ...summary,
          averageDurationMs: summary.dictations
            ? Math.round(summary.totalDurationMs / summary.dictations)
            : 0,
          averageWordsPerMinute: wordsPerMinute(summary.totalWords, summary.totalDurationMs),
        },
        costs: {
          currency: 'USD',
          deepgramMin: cost.min,
          deepgramMax: cost.max,
          deepseek: usage?.cost ?? 0,
          cleanupRequests: usage?.requests ?? 0,
          unmeteredRequests: usage?.unmetered ?? 0,
          estimated: true,
        },
        daily: dailyRows.reverse().map((row) => ({
          ...row,
          wordsPerMinute: wordsPerMinute(row.words, row.durationMs),
        })),
      };
    },
  };
}
