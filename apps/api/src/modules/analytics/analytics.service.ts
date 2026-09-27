import { createAnalyticsRepository } from './analytics.repository';
import type { AnalyticsRange, AnalyticsResponse } from './analytics.types';
import { startOfRange, wordsPerMinute } from './analytics.utils';

export function createAnalyticsService(database: D1Database) {
  const repository = createAnalyticsRepository(database);

  return {
    async get(userId: string, range: AnalyticsRange): Promise<AnalyticsResponse> {
      const since = startOfRange(range);
      const [summary, dailyRows] = await Promise.all([
        repository.getSummary(userId, since),
        repository.getDaily(userId, since),
      ]);

      return {
        range,
        summary: {
          ...summary,
          averageWordsPerMinute: wordsPerMinute(summary.totalWords, summary.totalDurationMs),
        },
        daily: dailyRows.reverse().map((row) => ({
          ...row,
          wordsPerMinute: wordsPerMinute(row.words, row.durationMs),
        })),
      };
    },
  };
}
