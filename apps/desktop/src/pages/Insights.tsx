import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { clientTimezone, minutes, type AnalyticsRange } from '@voxtype/shared/analytics';
import { toast } from 'sonner';
import { PageHeader } from '../components/layout';
import { Loader } from '../components/loader';
import { Button } from '../components/ui';
import { DownloadSimpleIcon } from '../components/icons';
import { MetricStrip, RangeControl, ActivityCalendar, TrendChart } from '../components/analytics';
import { api, native, useAnalytics } from '../lib/api';
export function InsightsPage() {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const query = useAnalytics(range),
    data = query.data;
  const exportCsv = useMutation({
    mutationFn: () => api.exportAnalytics(range, clientTimezone()),
    onSuccess: (saved) => {
      if (saved) toast.success('CSV saved');
    },
  });
  return (
    <>
      <PageHeader title="Insights" actions={<RangeControl value={range} onChange={setRange} />} />
      {query.isPending ? (
        <Loader />
      ) : query.isError ? (
        <div role="alert" className="rounded-panel border border-line bg-surface p-6">
          Insights unavailable. <Button onClick={() => void query.refetch()}>Retry</Button>
        </div>
      ) : (
        data && (
          <>
            <MetricStrip data={data} />
            <div className="my-4 flex flex-wrap gap-x-5 gap-y-2 text-caption text-muted">
              <span>
                <b className="text-ink">{data.summary.dictations}</b> dictations
              </span>
              <span>
                <b className="text-ink">
                  {data.summary.dictations ? minutes(data.summary.averageDurationMs) : '—'} min
                </b>{' '}
                average session
              </span>
              <span>
                <b className="text-ink">{data.summary.activeDays}</b> active days
              </span>
              <span>
                <b className="text-ink">{data.streaks.longest} days</b> longest streak
              </span>
            </div>
            <div className="insights-panels">
              <ActivityCalendar key={data.activity.start} data={data} />
              <TrendChart data={data} />
            </div>
            <div className="mt-4 flex items-start justify-between gap-5">
              <details className="max-w-xl text-caption text-muted">
                <summary className="cursor-pointer text-accent">Definitions</summary>
                <p className="mt-2">
                  Speed is words divided by recorded minutes. Average session is recorded minutes
                  divided by dictations. Streaks use full account history, ending today or
                  yesterday. Canceled recordings and microphone tests are excluded. Dates use{' '}
                  {data.timezone}. Pending uploads appear after sync.
                </p>
              </details>
              <Button
                variant="ghost"
                disabled={!native || !data.summary.dictations}
                loading={exportCsv.isPending}
                onClick={() => exportCsv.mutate()}
              >
                <DownloadSimpleIcon size={16} />
                Export CSV
              </Button>
            </div>
          </>
        )
      )}
    </>
  );
}
