import { useEffect, useState } from 'react';
import { money } from '@voxtype/shared/analytics';
import { CopyIcon, MicrophoneIcon, StopIcon, XIcon } from '../components/icons';
import { PageHeader } from '../components/layout';
import { Loader } from '../components/loader';
import { Button, IconButton } from '../components/ui';
import { Card } from '../components/ui/card';
import {
  api,
  native,
  useAnalytics,
  useAppSession,
  useCopy,
  useRecording,
  useSession,
} from '../lib/api';
import { duration, isActive } from '../lib/types';

export function HomePage({ visible }: { visible: boolean }) {
  const analytics = useAnalytics();
  const { data: globalSession } = useSession();
  const [ownedId, setOwnedId] = useState<string | null>(null);
  const { data: appSession } = useAppSession();
  const take = ownedId === appSession.sessionId ? appSession : null;
  const recording = useRecording();
  const copy = useCopy();
  const owns =
    ownedId === globalSession.sessionId && !globalSession.external && !globalSession.isTest;
  const active = owns && isActive(globalSession.phase);
  useEffect(() => {
    if (!visible || !active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') recording.cancel.mutate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, active, recording.cancel]);
  const start = async () => {
    await recording.start.mutateAsync(false);
    // The native command publishes synchronously. Read its exact ID after it starts,
    // rather than claiming an unrelated session from the shared event stream.
    const boot = await api.bootstrap();
    if (!boot.snapshot.external && !boot.snapshot.isTest) {
      setOwnedId(boot.snapshot.sessionId);
    }
  };
  const stats = analytics.data;
  return (
    <>
      <PageHeader title="Home" actions={<span className="text-ui text-muted">Last 30 days</span>} />
      {analytics.isPending ? (
        <Loader />
      ) : analytics.isError ? (
        <div className="mb-6 flex items-center gap-3 text-ui text-muted" role="alert">
          Analytics unavailable <Button onClick={() => void analytics.refetch()}>Retry</Button>
        </div>
      ) : (
        stats && (
          <>
            <div className="grid grid-cols-4 gap-3 max-xl:grid-cols-2">
              {[
                ['Words', stats.summary.totalWords.toLocaleString()],
                ['Minutes', (stats.summary.totalDurationMs / 60000).toFixed(1)],
                ['Avg. recording', duration(stats.summary.averageDurationMs)],
                ['Transcripts', stats.summary.dictations.toLocaleString()],
              ].map(([label, value]) => (
                <Card key={label} className="border-0 p-6 shadow-none">
                  <p className="text-ui text-muted">{label}</p>
                  <p className="mt-5 text-3xl font-medium tracking-tight tabular-nums">{value}</p>
                </Card>
              ))}
            </div>
            <div className="mt-5 mb-10 flex flex-wrap items-center justify-between gap-3 px-1 text-caption text-muted">
              <span>{stats.summary.averageWordsPerMinute} words / min</span>
              <span title="Deepgram: saved audio duration at Nova-3 list rates, including a range for language and vocabulary. DeepSeek: metered tokens at peak rates. Excludes unsaved audio, credits and discounts.">
                Estimated cost · Deepgram {money(stats.costs.deepgramMin)}–
                {money(stats.costs.deepgramMax)} · DeepSeek {money(stats.costs.deepseek)}
                {stats.costs.unmeteredRequests > 0 ? ' (partial)' : ''}
              </span>
            </div>
          </>
        )
      )}
      <Card className="overflow-hidden border-0 shadow-none">
        <div className="flex items-center justify-between gap-5 bg-subtle px-7 py-6">
          <div>
            <h2 className="text-title font-semibold">Quick recording</h2>
            <p className="mt-1 text-ui text-muted" role="status">
              {active
                ? `${take?.phase === 'listening' ? 'Recording' : 'Processing'} · ${duration(take?.elapsedMs ?? 0)}`
                : 'Record and copy'}
            </p>
          </div>
          <div className="flex gap-2">
            {active ? (
              <>
                <IconButton label="Cancel recording" onClick={() => recording.cancel.mutate()}>
                  <XIcon size={20} />
                </IconButton>
                <Button
                  onClick={() => recording.stop.mutate()}
                  disabled={globalSession.phase !== 'listening'}
                  loading={recording.pending}
                >
                  <StopIcon size={18} aria-hidden="true" />
                  Stop
                </Button>
              </>
            ) : (
              <Button
                onClick={() => void start().catch(() => {})}
                disabled={!native || isActive(globalSession.phase)}
                loading={recording.pending}
                title={!native ? 'Available in the installed app' : undefined}
              >
                <MicrophoneIcon size={20} weight="duotone" aria-hidden="true" />
                Record
              </Button>
            )}
          </div>
        </div>
        {(take?.text || take?.interim || active) && (
          <div className="p-7">
            <p className="min-h-24 whitespace-pre-wrap text-transcript [overflow-wrap:anywhere]">
              {take?.text} <span className="text-muted">{take?.interim}</span>
            </p>
            {!active && take?.text && (
              <Button variant="outline" className="mt-5" onClick={() => copy.mutate(take.text)}>
                <CopyIcon size={16} aria-hidden="true" />
                Copy text
              </Button>
            )}
          </div>
        )}
        {take?.phase === 'error' && (
          <p role="alert" className="px-7 py-4 text-ui text-danger">
            {take.message}
          </p>
        )}
      </Card>
    </>
  );
}
