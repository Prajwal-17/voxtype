import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { createDb } from '../../shared/database/client';
import { dictation } from '../../shared/database/schema';

function ownerAndRange(userId: string, since: Date | null) {
  return since
    ? and(eq(dictation.userId, userId), gte(dictation.createdAt, since))
    : eq(dictation.userId, userId);
}

export function createAnalyticsRepository(database: D1Database) {
  const db = createDb(database);

  return {
    async getSummary(userId: string, since: Date | null) {
      const [summary] = await db
        .select({
          dictations: sql<number>`count(*)`,
          totalWords: sql<number>`coalesce(sum(${dictation.wordCount}), 0)`,
          totalDurationMs: sql<number>`coalesce(sum(${dictation.durationMs}), 0)`,
        })
        .from(dictation)
        .where(ownerAndRange(userId, since));

      return summary ?? { dictations: 0, totalWords: 0, totalDurationMs: 0 };
    },

    getDaily(userId: string, since: Date | null) {
      const day = sql<string>`date(${dictation.createdAt} / 1000, 'unixepoch')`;
      return db
        .select({
          date: day,
          dictations: sql<number>`count(*)`,
          words: sql<number>`coalesce(sum(${dictation.wordCount}), 0)`,
          durationMs: sql<number>`coalesce(sum(${dictation.durationMs}), 0)`,
        })
        .from(dictation)
        .where(ownerAndRange(userId, since))
        .groupBy(day)
        .orderBy(desc(day))
        .limit(90);
    },
  };
}
