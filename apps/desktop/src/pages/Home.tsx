import { useEffect, useState } from 'react';
import { ArrowRightIcon, CopyIcon, MicrophoneIcon, StopIcon, XIcon } from '../components/icons';
import { PageHeader, StatusDot } from '../components/layout';
import { Loader } from '../components/loader';
import { Button, IconButton } from '../components/ui';
import { MetricStrip } from '../components/analytics';
import { Waveform } from '../components/waveform';
import {
  native,
  useAnalytics,
  useAppSession,
  useBootstrap,
  useCopy,
  useHistory,
  useRecording,
  useSession,
} from '../lib/api';
import { duration, isActive } from '../lib/types';

export function HomePage({
  visible,
  onNavigate,
  onOpenTranscript,
}: {
  visible: boolean;
  onNavigate: (page: 'insights' | 'transcripts') => void;
  onOpenTranscript: (id: string) => void;
}) {
  const analytics = useAnalytics(),
    history = useHistory(),
    boot = useBootstrap();
  const { data: globalSession } = useSession(),
    { data: appSession } = useAppSession();
  const [ownedId, setOwnedId] = useState<string | null>(null);
  const take = ownedId === appSession.sessionId ? appSession : null;
  const recording = useRecording(),
    copy = useCopy();
  const owns =
    ownedId === globalSession.sessionId && !globalSession.external && !globalSession.isTest;
  const active = owns && isActive(globalSession.phase);
  useEffect(() => {
    if (!visible || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') recording.cancel.mutate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, active, recording.cancel]);
  const start = async () => setOwnedId(await recording.start.mutateAsync(false));
  return (
    <>
      <PageHeader title="Home" />
      <section className="home-recorder" aria-label="Recorder">
        <div className="recorder-controls">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-panel bg-accent-soft text-accent">
            <MicrophoneIcon size={22} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-subheading font-semibold tracking-tight">
              {active
                ? take?.phase === 'listening'
                  ? 'Listening…'
                  : take?.phase === 'cleaning'
                    ? 'Cleaning up…'
                    : 'Transcribing…'
                : 'Turn a thought into text'}
            </h2>
            <p className="mt-1 text-ui text-muted" role={active ? 'status' : undefined}>
              {active ? (
                <>
                  <StatusDot live />{' '}
                  <span className="ml-1 tabular-nums">{duration(take?.elapsedMs ?? 0)}</span>
                </>
              ) : (
                'Record, read, and get back to what you were doing.'
              )}
            </p>
          </div>
          {active && (
            <Waveform
              level={visible ? (take?.level ?? 0) : 0}
              active={visible && take?.phase === 'listening'}
            />
          )}
          <div className="flex items-center gap-2">
            {active ? (
              <>
                <Button
                  variant="primary"
                  onClick={() => recording.stop.mutate()}
                  disabled={globalSession.phase !== 'listening'}
                  loading={recording.pending}
                >
                  <StopIcon size={16} weight="fill" />
                  Finish
                </Button>
                <IconButton
                  label="Cancel recording"
                  onClick={() => recording.cancel.mutate()}
                  disabled={recording.pending}
                >
                  <XIcon size={18} />
                </IconButton>
              </>
            ) : (
              <Button
                variant="primary"
                onClick={() => void start().catch(() => {})}
                disabled={!native || isActive(globalSession.phase)}
                loading={recording.pending}
              >
                <MicrophoneIcon size={16} />
                {take?.text ? 'Record again' : 'Start recording'}
              </Button>
            )}
          </div>
        </div>
        <div className="recorder-context">
          <span>
            {boot.data?.settings.microphone || 'System microphone'} ·{' '}
            {boot.data?.settings.language === 'multi'
              ? 'Multilingual'
              : boot.data?.settings.language.toUpperCase()}
          </span>
          {!native && <span>Recording is available in the installed app.</span>}
        </div>
        {(take?.text || take?.interim) && (
          <div className="recorder-result">
            <div className="max-h-60 overflow-y-auto">
              <p className="max-w-[70ch] select-text whitespace-pre-wrap text-transcript [overflow-wrap:anywhere]">
                {take.text} <span className="text-muted">{take.interim}</span>
              </p>
            </div>
            {!active && take.text && (
              <Button variant="ghost" className="mt-3" onClick={() => copy.mutate(take.text)}>
                <CopyIcon size={16} />
                Copy text
              </Button>
            )}
          </div>
        )}
        {take?.phase === 'error' && (
          <div className="px-5 pb-4">
            <p role="alert" className="mb-2 text-ui text-danger">
              {take.message}
            </p>
            <Button variant="outline" onClick={() => onNavigate('transcripts')}>
              Recover recording
            </Button>
          </div>
        )}
        {take?.cleanupWarning && (
          <p role="status" className="px-5 pb-4 text-ui text-warning">
            {take.cleanupWarning}
          </p>
        )}
      </section>
      <section className="home-section" aria-label="Recording overview">
        <div className="section-heading">
          <div className="flex items-baseline gap-3">
            <h2 className="text-title font-semibold">Your activity</h2>
            <span className="text-caption text-muted">Last 30 days</span>
          </div>
          <Button variant="link" size="sm" onClick={() => onNavigate('insights')}>
            Insights
            <ArrowRightIcon size={14} />
          </Button>
        </div>
        {analytics.isPending ? (
          <Loader />
        ) : analytics.isError && !analytics.data ? (
          <p role="alert" className="text-ui text-muted">
            Overview unavailable.{' '}
            <Button variant="ghost" size="sm" onClick={() => void analytics.refetch()}>
              Retry
            </Button>
          </p>
        ) : (
          analytics.data && <MetricStrip data={analytics.data} />
        )}
      </section>
      <section className="home-section" aria-label="Recent transcripts">
        <div className="section-heading">
          <h2 className="text-title font-semibold">Recent transcripts</h2>
          <Button variant="link" size="sm" onClick={() => onNavigate('transcripts')}>
            View all
            <ArrowRightIcon size={14} />
          </Button>
        </div>
        {history.isPending ? (
          <Loader />
        ) : history.isError && !history.data ? (
          <p role="alert" className="text-ui text-muted">
            Transcripts unavailable.{' '}
            <Button variant="ghost" size="sm" onClick={() => void history.refetch()}>
              Retry
            </Button>
          </p>
        ) : !history.data?.pages[0]?.items.length ? (
          <p className="py-6 text-ui text-muted">
            Your transcripts will be here after your first recording.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {history.data.pages[0].items.slice(0, 4).map((item) => (
              <div key={item.id} className="recent-transcript">
                <button
                  className="min-w-0 flex-1 py-3 text-left"
                  onClick={() => onOpenTranscript(item.id)}
                >
                  <p className="truncate text-ui font-medium">{item.text || 'Empty transcript'}</p>
                  <p className="mt-1 text-caption text-muted">
                    {new Date(item.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    · {item.words} words · {duration(item.durationMs)}
                  </p>
                </button>
                <IconButton
                  label="Copy transcript"
                  disabled={copy.isPending}
                  onClick={() => copy.mutate(item.text)}
                >
                  <CopyIcon size={16} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
