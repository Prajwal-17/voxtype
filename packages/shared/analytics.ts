export type Analytics = {
  range: '7d' | '30d' | 'all';
  summary: {
    dictations: number;
    totalWords: number;
    totalDurationMs: number;
    averageWordsPerMinute: number;
    averageDurationMs: number;
  };
  costs: {
    currency: 'USD';
    deepgramMin: number;
    deepgramMax: number;
    deepseek: number;
    cleanupRequests: number;
    unmeteredRequests: number;
    estimated: true;
  };
  daily: {
    date: string;
    dictations: number;
    words: number;
    durationMs: number;
    wordsPerMinute: number;
  }[];
};
export const emptyAnalytics: Analytics = {
  range: '30d',
  summary: {
    dictations: 0,
    totalWords: 0,
    totalDurationMs: 0,
    averageWordsPerMinute: 0,
    averageDurationMs: 0,
  },
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
