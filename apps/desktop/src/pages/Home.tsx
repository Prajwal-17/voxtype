import { useEffect, useState } from 'react';
import { CopyIcon, MicrophoneIcon, StopIcon, XIcon } from '../components/icons';
import { PageHeader } from '../components/layout';
import { Loader } from '../components/loader';
import { Button, IconButton } from '../components/ui';
import { Card } from '../components/ui/card';
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
}: {
  visible: boolean;
  onNavigate: (page: 'insights' | 'transcripts') => void;
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
  const start = async () => {
    setOwnedId(await recording.start.mutateAsync(false));
  };
  return (
    <>
      <PageHeader title="Home" />
      <Card className="overflow-hidden shadow-none">
        <div className="flex min-h-[158px] items-center gap-5 p-[22px] max-sm:flex-wrap">
          <div className="flex size-[60px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <MicrophoneIcon size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-semibold tracking-tight">Dictation</h2>
            {active && (
              <p role="status" className="mt-1 text-ui text-muted">
                {take?.phase === 'listening'
                  ? 'Recording'
                  : take?.phase === 'cleaning'
                    ? 'Cleaning'
                    : 'Transcribing'}{' '}
                · {duration(take?.elapsedMs ?? 0)}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {active ? (
                <>
                  <Button
                    variant="primary"
                    onClick={() => recording.stop.mutate()}
                    disabled={globalSession.phase !== 'listening'}
                    loading={recording.pending}
                  >
                    <StopIcon size={16} />
                    Finish recording
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => recording.cancel.mutate()}
                    disabled={recording.pending}
                  >
                    <XIcon size={16} />
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => void start().catch(() => {})}
                  disabled={!native || isActive(globalSession.phase)}
                  loading={recording.pending}
                >
                  <MicrophoneIcon size={17} />
                  {take?.text ? 'Record again' : 'Start recording'}
                </Button>
              )}
            </div>
            {!native && (
              <p className="mt-2 text-caption text-muted">
                Recording is available in the installed app.
              </p>
            )}
          </div>
          {active && (
            <Waveform
              level={visible ? (take?.level ?? 0) : 0}
              active={visible && take?.phase === 'listening'}
            />
          )}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-line bg-raised px-5 py-3 text-caption text-muted">
          <span>{boot.data?.settings.microphone || 'System default'}</span>
          <span>
            {boot.data?.settings.language === 'multi'
              ? 'Multilingual'
              : boot.data?.settings.language.toUpperCase()}
          </span>
        </div>
        {(take?.text || take?.interim) && (
          <div className="border-t border-line p-5">
            <p className="select-text whitespace-pre-wrap text-transcript [overflow-wrap:anywhere]">
              {take.text} <span className="text-muted">{take.interim}</span>
            </p>
            {!active && take.text && (
              <Button variant="outline" className="mt-4" onClick={() => copy.mutate(take.text)}>
                <CopyIcon size={20} />
                Copy text
              </Button>
            )}
          </div>
        )}
        {take?.phase === 'error' && (
          <div className="px-5 py-3">
            <p role="alert" className="mb-3 text-ui text-danger">
              {take.message}
            </p>
            <Button variant="outline" onClick={() => onNavigate('transcripts')}>
              Recover recording
            </Button>
          </div>
        )}
        {take?.cleanupWarning && (
          <p role="status" className="px-5 py-3 text-ui text-warning">
            {take.cleanupWarning}
          </p>
        )}
      </Card>
      <div className="mt-5 mb-2 flex items-center justify-between">
        <span className="text-caption text-muted">Last 30 days</span>
        <Button variant="link" onClick={() => onNavigate('insights')}>
          Insights →
        </Button>
      </div>
      {analytics.isPending ? (
        <Loader />
      ) : analytics.isError ? (
        <p role="alert" className="text-ui text-muted">
          Overview unavailable. <Button onClick={() => void analytics.refetch()}>Retry</Button>
        </p>
      ) : (
        analytics.data && <MetricStrip data={analytics.data} />
      )}
      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-title font-semibold">Recent transcripts</h2>
        <Button variant="link" onClick={() => onNavigate('transcripts')}>
          View all →
        </Button>
      </div>
      {history.isPending ? (
        <Loader />
      ) : history.isError ? (
        <p role="alert" className="text-ui text-muted">
          Transcripts unavailable. <Button onClick={() => void history.refetch()}>Retry</Button>
        </p>
      ) : !history.data?.pages[0]?.items.length ? (
        <p className="py-5 text-ui text-muted">No transcripts yet</p>
      ) : (
        <div className="divide-y divide-line">
          {history.data.pages[0].items.slice(0, 3).map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-ui font-medium">{item.text || 'Empty transcript'}</p>
                <p className="mt-1 text-caption text-muted">
                  {new Date(item.createdAt).toLocaleString()} · {item.words} words ·{' '}
                  {duration(item.durationMs)}
                </p>
              </div>
              <IconButton
                label="Copy transcript"
                disabled={copy.isPending}
                onClick={() => copy.mutate(item.text)}
              >
                <CopyIcon size={20} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
