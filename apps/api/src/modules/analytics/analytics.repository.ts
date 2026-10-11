import type { DailyActivity } from '@voxtype/shared/analytics';
import { dateExpression } from './analytics.utils';
export function createAnalyticsRepository(database: D1Database) {
  return {
    getCleanupUsage(userId: string, since: Date | null, now = Date.now()) {
      return database
        .prepare(
          `SELECT COALESCE(SUM(cost_usd),0) AS cost, COUNT(*) AS requests, COALESCE(SUM(CASE WHEN cost_usd IS NULL THEN 1 ELSE 0 END),0) AS unmetered FROM speech_usage WHERE user_id = ? AND created_at >= ? AND created_at <= ?`,
        )
        .bind(userId, since?.getTime() ?? 0, now)
        .first<{ cost: number; requests: number; unmetered: number }>();
    },
    async getDaily(userId: string, timezone: string, now: number): Promise<DailyActivity[]> {
      const first = await database
        .prepare(
          'SELECT MIN(created_at) AS earliest FROM dictation WHERE user_id = ? AND created_at <= ?',
        )
        .bind(userId, now)
        .first<{ earliest: number | null }>();
      if (first?.earliest == null) return [];
      const day = dateExpression(first.earliest, now, timezone);
      const rows = await database
        .prepare(
          `SELECT ${day} AS date, COUNT(*) AS dictations, COALESCE(SUM(word_count),0) AS words, COALESCE(SUM(duration_ms),0) AS durationMs FROM dictation WHERE user_id = ? AND created_at <= ? GROUP BY ${day} ORDER BY date`,
        )
        .bind(userId, now)
        .all<Omit<DailyActivity, 'wordsPerMinute'>>();
      return rows.results.map((r) => ({
        ...r,
        wordsPerMinute: r.durationMs > 0 ? Math.round((r.words * 60000) / r.durationMs) : 0,
      }));
    },
  };
}
