import {
  localDate,
  shiftDate,
  speed,
  type AnalyticsRange,
  type Analytics,
  type DailyActivity,
} from '@voxtype/shared/analytics';
export const wordsPerMinute = speed;
export function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return /^[A-Za-z0-9_+./-]{1,100}$/.test(value);
  } catch {
    return false;
  }
}
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** Offset at an instant, including historical/DST changes and fractional-hour zones. */
export function timezoneOffset(time: number, timezone: string): number {
  let formatter = offsetFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    if (offsetFormatters.size >= 32) offsetFormatters.delete(offsetFormatters.keys().next().value!);
    offsetFormatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(time);
  const n = (key: string) => Number(parts.find((p) => p.type === key)?.value);
  return (
    (Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) -
      Math.floor(time / 1000) * 1000) /
    1000
  );
}
export function midnight(date: string, timezone: string): number {
  const utc = Date.parse(`${date}T00:00:00Z`);
  let value = utc;
  for (let i = 0; i < 4; i++) value = utc - timezoneOffset(value, timezone) * 1000;
  return value;
}
export function startOfRange(
  range: AnalyticsRange,
  now = Date.now(),
  timezone = 'UTC',
): Date | null {
  return range === 'all'
    ? null
    : new Date(midnight(shiftDate(localDate(now, timezone), range === '7d' ? -6 : -29), timezone));
}
/** SQLite lacks IANA zones. Build numeric-only CASE boundaries, then aggregate in SQL.
 * Scan at most 100 years of calendar days; never download individual dictations. */
export function dateExpression(earliest: number, now: number, timezone: string): string {
  if (timezone === 'UTC') return "date(created_at / 1000, 'unixepoch')";
  const start = Math.max(earliest, now - 100 * 366 * 86400000);
  let previousTime = start,
    offset = timezoneOffset(start, timezone);
  const transitions: { time: number; offset: number }[] = [];
  for (
    let time = Math.min(start + 86400000, now);
    previousTime < now;
    time = Math.min(time + 86400000, now)
  ) {
    const next = timezoneOffset(time, timezone);
    if (next !== offset) {
      let low = Math.floor(previousTime / 1000),
        high = Math.ceil(time / 1000);
      while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (timezoneOffset(middle * 1000, timezone) === offset) low = middle;
        else high = middle;
      }
      transitions.push({ time: high * 1000, offset: next });
    }
    previousTime = time;
    offset = next;
  }
  const initial = timezoneOffset(start, timezone);
  const expression = transitions.length
    ? `CASE ${transitions
        .reverse()
        .map((t) => `WHEN created_at >= ${t.time} THEN ${t.offset}`)
        .join(' ')} ELSE ${initial} END`
    : String(initial);
  return `date(created_at / 1000 + (${expression}), 'unixepoch')`;
}
export function streaks(days: DailyActivity[], today: string) {
  let longest = 0,
    run = 0,
    previous = '';
  const active = days.filter((d) => d.dictations > 0 && d.date <= today);
  for (const day of active) {
    run = previous && shiftDate(previous, 1) === day.date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day.date;
  }
  const dates = new Set(active.map((d) => d.date));
  let date = dates.has(today) ? today : shiftDate(today, -1),
    current = 0;
  while (dates.has(date)) {
    current++;
    date = shiftDate(date, -1);
  }
  return { current, longest };
}
export function fillDays(rows: DailyActivity[], start: string, end: string): DailyActivity[] {
  const byDate = new Map(rows.map((d) => [d.date, d]));
  const result: DailyActivity[] = [];
  for (let date = start; date <= end; date = shiftDate(date, 1))
    result.push(
      byDate.get(date) ?? { date, dictations: 0, words: 0, durationMs: 0, wordsPerMinute: 0 },
    );
  return result;
}
export function trend(rows: DailyActivity[]): Analytics['trend'] {
  const span = rows.length
    ? (Date.parse(rows.at(-1)!.date) - Date.parse(rows[0]!.date)) / 86400000
    : 0;
  const bucket = span <= 119 ? 'day' : span <= 800 ? 'week' : span <= 3500 ? 'month' : 'year';
  const bins = new Map<string, DailyActivity>();
  for (const row of rows) {
    const date =
      bucket === 'year'
        ? `${row.date.slice(0, 4)}-01-01`
        : bucket === 'month'
          ? `${row.date.slice(0, 7)}-01`
          : bucket === 'week'
            ? shiftDate(row.date, -(new Date(`${row.date}T12:00Z`).getUTCDay() + 6) % 7)
            : row.date;
    const bin = bins.get(date) ?? {
      date,
      dictations: 0,
      words: 0,
      durationMs: 0,
      wordsPerMinute: 0,
    };
    bin.dictations += row.dictations;
    bin.words += row.words;
    bin.durationMs += row.durationMs;
    bin.wordsPerMinute = speed(bin.words, bin.durationMs);
    bins.set(date, bin);
  }
  if (rows.length) {
    const keys = [...bins.keys()];
    for (let date = keys[0]!; date <= keys.at(-1)!;) {
      if (!bins.has(date))
        bins.set(date, { date, dictations: 0, words: 0, durationMs: 0, wordsPerMinute: 0 });
      date =
        bucket === 'day'
          ? shiftDate(date, 1)
          : bucket === 'week'
            ? shiftDate(date, 7)
            : new Date(
                Date.UTC(
                  Number(date.slice(0, 4)) + (bucket === 'year' ? 1 : 0),
                  Number(date.slice(5, 7)) - 1 + (bucket === 'month' ? 1 : 0),
                  1,
                ),
              )
                .toISOString()
                .slice(0, 10);
    }
  }
  return { bucket, days: [...bins.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}
