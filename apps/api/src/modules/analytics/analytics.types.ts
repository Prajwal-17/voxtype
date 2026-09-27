export type AnalyticsRange = '7d' | '30d' | 'all';

export type AnalyticsSummaryRow = {
  dictations: number;
  totalWords: number;
  totalDurationMs: number;
};

export type AnalyticsDailyRow = {
  date: string;
  dictations: number;
  words: number;
  durationMs: number;
};

export type AnalyticsResponse = {
  range: AnalyticsRange;
  summary: AnalyticsSummaryRow & { averageWordsPerMinute: number };
  daily: Array<AnalyticsDailyRow & { wordsPerMinute: number }>;
};
