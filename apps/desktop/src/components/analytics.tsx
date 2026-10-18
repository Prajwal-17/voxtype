import { useRef, useState, type ReactNode } from 'react';
import { color } from '@voxtype/shared';
import {
  activityDescription,
  activityLevel,
  minutes,
  type Analytics,
  type AnalyticsRange,
} from '@voxtype/shared/analytics';
export function RangeControl({
  value,
  onChange,
}: {
  value: AnalyticsRange;
  onChange: (value: AnalyticsRange) => void;
}) {
  return (
    <div className="compact-tabs" role="group" aria-label="Insights period">
      {(
        [
          ['7d', '7 days'],
          ['30d', '30 days'],
          ['all', 'All time'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={value === id ? 'is-current' : undefined}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
export function MetricStrip({ data }: { data: Analytics }) {
  const s = data.summary;
  return (
    <div className="metric-strip">
      {[
        ['Words dictated', s.totalWords.toLocaleString(), ''],
        ['Recording time', minutes(s.totalDurationMs), 'min'],
        ['Average speed', s.totalDurationMs ? String(s.averageWordsPerMinute) : '—', 'WPM'],
        ['Current streak', String(data.streaks.current), 'days'],
      ].map(([label, value, unit]) => (
        <div key={label}>
          <p className="text-caption text-muted">{label}</p>
          <p className="mt-1">
            <span className="metric-value">{value}</span>{' '}
            <span className="text-caption text-muted">{unit}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
export function ActivityCalendar({ data }: { data: Analytics }) {
  const days = data.activity.days,
    initial = Math.max(
      0,
      days.findIndex((d) => d.date === data.period.end),
    );
  const [selected, setSelected] = useState(initial);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const day = days[selected];
  const colors = [
    color.activity0,
    color.activity1,
    color.activity2,
    color.activity3,
    color.activity4,
  ];
  const choose = (index: number, focus = false) => {
    const next = Math.min(days.length - 1, Math.max(0, index));
    if (!days[next] || days[next].date > data.period.end) return;
    setSelected(next);
    if (focus) buttons.current[next]?.focus();
  };
  return (
    <section className="insights-section" aria-label="Activity calendar">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title font-semibold">Activity</h2>
        <span className="text-caption text-muted">
          {data.activity.start} – {data.activity.end}
        </span>
      </div>
      <p className="mt-3 text-caption text-muted">
        {days.reduce((n, d) => n + d.dictations, 0)} dictations ·{' '}
        {days.filter((d) => d.dictations > 0).length} active days
      </p>
      {days.length ? (
        <>
          <div className="mt-4 flex flex-wrap items-start gap-x-10 gap-y-4">
            <div className="w-[239px] shrink-0">
              <div className="flex">
                <div className="w-8 pt-5 text-[11px] leading-[30px] text-muted" aria-hidden="true">
                  <div>Mon</div>
                  <div>Wed</div>
                  <div>Fri</div>
                  <div>Sun</div>
                </div>
                <div>
                  <div
                    className="mb-2 flex h-4 w-[207px] text-[11px] text-muted"
                    aria-hidden="true"
                  >
                    {Array.from({ length: 14 }, (_, week) => {
                      const d = days[week * 7];
                      const prev = days[(week - 1) * 7];
                      return (
                        <span key={week} className="w-[15px] shrink-0 whitespace-nowrap">
                          {d && (!prev || d.date.slice(0, 7) !== prev.date.slice(0, 7))
                            ? new Date(`${d.date}T12:00Z`).toLocaleDateString(undefined, {
                                month: 'short',
                                timeZone: 'UTC',
                              })
                            : ''}
                        </span>
                      );
                    })}
                  </div>
                  <div
                    className="activity-grid"
                    role="group"
                    aria-label="Daily words; arrow keys select a day"
                  >
                    {days.map((d, index) => (
                      <button
                        key={d.date}
                        ref={(node) => {
                          buttons.current[index] = node;
                        }}
                        className="activity-cell"
                        style={{
                          background: colors[activityLevel(d.words)],
                          opacity: d.date > data.period.end ? 0.35 : 1,
                        }}
                        disabled={d.date > data.period.end}
                        tabIndex={index === selected ? 0 : -1}
                        aria-pressed={index === selected}
                        aria-label={activityDescription(d)}
                        title={activityDescription(d)}
                        onClick={() => choose(index)}
                        onKeyDown={(e) => {
                          const move = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[
                            e.key
                          ];
                          if (move !== undefined) {
                            e.preventDefault();
                            choose(index + move, true);
                          } else if (e.key === 'Home' || e.key === 'End') {
                            e.preventDefault();
                            choose(e.key === 'Home' ? 0 : initial, true);
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1 text-[11px] text-muted">
                <span className="mr-auto">Words / day</span>Less{' '}
                {colors.map((c) => (
                  <span key={c} className="size-2.5 rounded-[2px]" style={{ background: c }} />
                ))}{' '}
                More
              </div>
            </div>
            {day && (
              <div
                className="min-w-[180px] flex-1 py-2"
                role="status"
                aria-label={activityDescription(day)}
              >
                <h3 className="text-ui font-medium">
                  {new Date(`${day.date}T12:00Z`).toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })}
                </h3>
                <dl className="mt-3 grid grid-cols-3 gap-4">
                  <div>
                    <dt className="text-caption text-muted">Words</dt>
                    <dd className="mt-1 text-title font-semibold">{day.words.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-muted">Dictations</dt>
                    <dd className="mt-1 text-title font-semibold">{day.dictations}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-muted">Minutes</dt>
                    <dd className="mt-1 text-title font-semibold">{minutes(day.durationMs)}</dd>
                  </div>
                </dl>
                <p className="mt-4 text-caption text-muted">Select a day to see its activity.</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="mt-5 text-ui text-muted">No activity yet</p>
      )}
    </section>
  );
}
export function TrendChart({
  data,
  mode,
  controls,
}: {
  data: Analytics;
  mode: 'words' | 'speed';
  controls?: ReactNode;
}) {
  const rows = data.trend.days,
    values = rows.map((d) => (mode === 'words' ? d.words : d.wordsPerMinute)),
    axisMax = Math.max(0, ...values),
    max = Math.max(1, axisMax);
  return (
    <section
      className="insights-section"
      aria-label={mode === 'words' ? 'Word trend' : 'Speed trend'}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-title font-semibold">
          {mode === 'words' ? 'Words over time' : 'Speaking speed'}
        </h2>
        {controls}
      </div>
      <div className="mt-6 flex gap-3">
        <div
          className="flex h-[150px] w-10 shrink-0 flex-col justify-between text-right text-caption text-muted"
          aria-hidden="true"
        >
          <span>{axisMax.toLocaleString()}</span>
          <span>{(axisMax / 2).toLocaleString()}</span>
          <span>0</span>
        </div>
        <div
          className="flex h-[150px] min-w-0 flex-1 items-end gap-1 border-b border-line"
          role="img"
          aria-label={`${data.trend.bucket} ${mode === 'words' ? 'words' : 'WPM'} trend: ${rows.length} periods. Maximum ${max}.`}
        >
          {rows.map((d, i) => (
            <div
              key={d.date}
              className="min-w-0 flex-1 rounded-t-[2px] bg-accent"
              style={{ height: values[i] ? `${Math.max(1, (values[i] / max) * 100)}%` : '1px' }}
              title={`${d.date}: ${values[i]} ${mode === 'words' ? 'words' : 'WPM'}`}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 ml-[52px] flex justify-between text-caption text-muted">
        <span>{rows[0]?.date ?? '—'}</span>
        <span>{rows.at(-1)?.date ?? '—'}</span>
      </div>
      <p className="mt-3 text-caption text-muted">
        {data.trend.bucket === 'day'
          ? 'Daily'
          : data.trend.bucket === 'week'
            ? 'Weekly'
            : data.trend.bucket === 'month'
              ? 'Monthly'
              : 'Yearly'}{' '}
        {mode === 'words' ? 'word totals' : 'weighted WPM'}
      </p>
      <table className="sr-only">
        <caption>
          {mode === 'words' ? 'Word totals' : 'Weighted speed'} by {data.trend.bucket}
        </caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{mode === 'words' ? 'Words' : 'WPM'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.date}>
              <th scope="row">{row.date}</th>
              <td>{values[index]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
