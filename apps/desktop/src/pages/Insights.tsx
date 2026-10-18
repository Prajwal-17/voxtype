import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { clientTimezone, minutes, type AnalyticsRange } from '@voxtype/shared/analytics';
import { toast } from 'sonner';
import { PageHeader } from '../components/layout';
import { Loader } from '../components/loader';
import { Button } from '../components/ui';
import { DotsThreeIcon, DownloadSimpleIcon } from '../components/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { MetricStrip, RangeControl, ActivityCalendar, TrendChart } from '../components/analytics';
import { api, native, useAnalytics } from '../lib/api';

export function InsightsPage() {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [mode, setMode] = useState<'words' | 'speed'>('words');
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
      <PageHeader
        title="Insights"
        actions={
          <div className="flex items-center gap-2">
            <RangeControl value={range} onChange={setRange} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More insights actions">
                  <DotsThreeIcon size={20} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!native || !data?.summary.dictations || exportCsv.isPending}
                  onSelect={() => exportCsv.mutate()}
                >
                  <DownloadSimpleIcon />
                  Export CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />
      {query.isPending ? (
        <Loader />
      ) : query.isError && !data ? (
        <div role="alert" className="py-8 text-ui">
          Insights unavailable.{' '}
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        data && (
          <>
            <MetricStrip data={data} />
            <div className="my-5 flex flex-wrap gap-x-5 gap-y-2 text-caption text-muted">
              <span>
                <b className="font-medium text-ink">{data.summary.dictations}</b> dictations
              </span>
              <span>
                <b className="font-medium text-ink">
                  {data.summary.dictations ? minutes(data.summary.averageDurationMs) : '—'} min
                </b>{' '}
                average session
              </span>
              <span>
                <b className="font-medium text-ink">{data.summary.activeDays}</b> active days
              </span>
              <span>
                <b className="font-medium text-ink">
                  {data.streaks.longest} {data.streaks.longest === 1 ? 'day' : 'days'}
                </b>{' '}
                longest streak
              </span>
            </div>
            {query.isError && (
              <p role="status" className="mb-3 text-caption text-muted">
                Couldn’t refresh. Showing saved activity.{' '}
                <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>
                  Retry
                </Button>
              </p>
            )}
            <ActivityCalendar key={data.activity.start} data={data} />
            <TrendChart
              data={data}
              mode={mode}
              controls={
                <div className="compact-tabs" role="group" aria-label="Trend metric">
                  {(['words', 'speed'] as const).map((metric) => (
                    <button
                      key={metric}
                      aria-pressed={mode === metric}
                      onClick={() => setMode(metric)}
                    >
                      {metric === 'words' ? 'Words' : 'Speed'}
                    </button>
                  ))}
                </div>
              }
            />
            <p className="mt-5 max-w-[75ch] text-caption leading-relaxed text-muted">
              Speed is words per recorded minute. Streaks use full account history. Dates use{' '}
              {data.timezone}; pending uploads appear after sync.
            </p>
          </>
        )
      )}
    </>
  );
}
