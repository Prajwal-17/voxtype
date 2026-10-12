import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyAnalytics } from '../packages/shared/analytics';
import { parseAnalyticsResponse } from '../apps/mobile/src/lib/analytics-response';

test('the restored analytics contract preserves real streak, calendar and trend data', () => {
  assert.deepEqual(parseAnalyticsResponse({ data: emptyAnalytics }), emptyAnalytics);
  const data = { ...emptyAnalytics, streaks: { current: 3, longest: 5 } };
  assert.equal(parseAnalyticsResponse({ data }).streaks.current, 3);
});

test('incompatible and malformed analytics are rejected before Home renders', () => {
  for (const data of [
    undefined,
    null,
    {},
    { range: '30d', summary: null, daily: [] },
    { ...emptyAnalytics, summary: { ...emptyAnalytics.summary, totalWords: '11' } },
    { ...emptyAnalytics, summary: { ...emptyAnalytics.summary, totalDurationMs: NaN } },
    { ...emptyAnalytics, costs: { currency: 'USD' } },
    { ...emptyAnalytics, daily: [null] },
    { ...emptyAnalytics, streaks: undefined },
    { ...emptyAnalytics, activity: undefined },
    { ...emptyAnalytics, trend: { bucket: 'day', days: [null] } },
  ]) {
    assert.throws(() => parseAnalyticsResponse({ data }), /incompatible/);
  }
});
