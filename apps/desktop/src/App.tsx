import clsx from 'clsx';
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  CircleAlert,
  CircleHelp,
  Copy,
  FileText,
  History,
  Keyboard,
  KeyRound,
  Mic,
  Settings2,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { VoiceOverlay } from './components/overlay';
import { Button, IconButton, Logo, Shortcut } from './components/ui';
import { Waveform } from './components/waveform';
import { native, useBootstrap, useCopy, useRecording, useSession } from './lib/api';
import { duration, isActive, type Bootstrap, type Session } from './lib/types';
import { HistoryPage } from './pages/History';
import { SettingsPage } from './pages/Settings';

type Page = 'dictation' | 'history' | 'settings';
const navigation = [
  { id: 'dictation', icon: AudioLines, label: 'Dictation' },
  { id: 'history', icon: History, label: 'History' },
  { id: 'settings', icon: Settings2, label: 'Settings' },
] as const;

export function App() {
  const [page, setPage] = useState<Page>('dictation');
  const [preview, setPreview] = useState(false);
  const boot = useBootstrap();
  const { data: session } = useSession();
  const active = isActive(session.phase);
  const { cancel } = useRecording();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (preview) {
          setPreview(false);
          return;
        }
        if (active) {
          event.preventDefault();
          cancel.mutate();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, preview, cancel]);

  return (
    <div className="flex min-h-screen selection:bg-accent-soft selection:text-accent-ink">
      <aside className="group sidebar fixed inset-y-0 left-0 z-10 flex w-48 shrink-0 flex-col bg-graphite px-3 py-7 text-inverse [&>div:first-child]:mb-12 [&>div:first-child]:ml-3 max-[1050px]:w-44 max-[700px]:w-16 max-[700px]:px-2 max-[700px]:py-5 max-[700px]:[&>div:first-child]:mx-0 max-[700px]:[&>div:first-child]:mb-8 max-[700px]:[&>div:first-child]:justify-center max-[700px]:[&>div:first-child>span:last-child]:hidden">
        <Logo />
        <nav className="flex flex-col gap-1" aria-label="Main navigation">
          {navigation.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className="flex h-11 w-full items-center gap-3 rounded-control border-0 bg-transparent px-3 text-left text-ui font-medium text-inverse-muted aria-[current=page]:bg-graphite-raised aria-[current=page]:text-inverse aria-[current=page]:[&>svg]:text-signal hover:not-aria-[current=page]:bg-graphite-raised hover:not-aria-[current=page]:text-inverse max-[700px]:justify-center max-[700px]:px-0 max-[700px]:[&>span]:hidden"
              aria-label={label}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => setPage(id)}
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>{label}</span>
              {page === id && (
                <span className="ml-auto size-1 rounded-full bg-signal max-[700px]:hidden" />
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto pt-12 max-[700px]:hidden">
          <button
            className="mb-5 grid w-full grid-cols-[16px_1fr] items-center gap-x-2 gap-y-2 rounded-control border border-graphite-line bg-transparent px-3 py-3 text-left text-caption text-inverse-muted hover:text-inverse [&_[data-shortcut]]:col-start-2"
            onClick={() => setPage('settings')}
          >
            <Keyboard size={17} />
            <span>Record anywhere</span>
            <Shortcut />
          </button>
          <div className="flex items-center gap-2.5 border-t border-graphite-line px-2 pt-5 [&>svg]:text-inverse-muted [&_strong]:block [&_strong]:text-caption [&_strong]:font-medium [&_strong]:text-inverse [&_div>span]:mt-1 [&_div>span]:block [&_div>span]:text-caption [&_div>span]:text-inverse-muted">
            <ShieldCheck size={16} />
            <div>
              <strong>Transcript history</strong>
              <span>
                {boot.data?.settings.keepHistory ? 'Saved on this device' : 'History off'}
              </span>
            </div>
          </div>
          <button
            className="mt-5 flex w-full items-center gap-2 border-0 bg-transparent px-2 text-caption text-inverse-muted hover:text-inverse [&>svg:last-child]:ml-auto"
            onClick={() => setPage('settings')}
          >
            <CircleHelp size={15} />
            <span>Setup & help</span>
            <ArrowUpRight size={14} />
          </button>
        </div>
      </aside>
      <main className="ml-48 min-w-0 flex-1 max-[1050px]:ml-44 max-[700px]:ml-16">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-line px-9 text-caption text-muted max-[1050px]:px-6 max-[700px]:px-4">
          <span className="font-medium">Personal workspace</span>
          <span
            className="flex items-center gap-2 data-[active=true]:text-accent data-[active=true]:[&_[data-status-dot]]:bg-accent max-[700px]:text-[11px]"
            data-active={session.phase === 'listening'}
          >
            <span
              className="inline-block size-1.5 shrink-0 rounded-full bg-muted data-[live=true]:bg-accent"
              data-status-dot
            />
            {session.phase === 'listening'
              ? 'Microphone on'
              : active
                ? 'Processing transcript'
                : boot.data?.hasKey
                  ? 'Ready to dictate'
                  : 'Setup required'}
            <span className="ml-3 border-l border-line pl-4 tabular-nums max-[700px]:hidden">
              v{boot.data?.version ?? '0.1.0'}
            </span>
          </span>
        </header>
        {!native && (
          <div className="bg-warning-soft px-5 py-2 text-center text-caption text-warning">
            Browser preview · Open the desktop app to record.
          </div>
        )}
        <div className="mx-auto max-w-6xl px-9 pt-9 pb-7 min-[1280px]:pt-12 max-[1050px]:px-6 max-[1050px]:py-7 max-[700px]:px-4 max-[700px]:py-6">
          {boot.isPending ? (
            <div
              className="flex flex-col gap-5 py-5 [&>div]:h-6 [&>div]:w-2/5 [&>div]:rounded-control [&>div]:bg-line [&>div:last-child]:h-72 [&>div:last-child]:w-full"
              aria-label="Loading Flow"
            >
              <div />
              <div />
              <div />
            </div>
          ) : boot.isError ? (
            <div className="px-5 py-16 [&_p]:mt-3 [&_p]:mb-6 [&_p]:text-muted">
              <h1>Flow couldn’t load.</h1>
              <p>{String(boot.error)}</p>
              <Button onClick={() => void boot.refetch()}>Try again</Button>
            </div>
          ) : (
            boot.data && (
              <>
                {page === 'dictation' && (
                  <Dictation
                    boot={boot.data}
                    session={session}
                    onSettings={() => setPage('settings')}
                    onPreview={() => setPreview((value) => !value)}
                  />
                )}
                {page === 'history' && <HistoryPage onRecord={() => setPage('dictation')} />}
                {page === 'settings' && <SettingsPage boot={boot.data} active={active} />}
              </>
            )
          )}
        </div>
        {preview && page === 'dictation' && (
          <div className="fixed bottom-7 left-[calc(50%+6rem)] z-20 w-[min(240px,calc(100vw-12rem-24px))] -translate-x-1/2 p-2 max-[1050px]:left-[calc(50%+5.5rem)] max-[1050px]:w-[min(240px,calc(100vw-11rem-24px))] max-[700px]:left-[calc(50%+2rem)] max-[700px]:w-[min(240px,calc(100vw-4rem-24px))]">
            <div className="flex items-center justify-between pl-2 text-caption text-muted">
              <span>Voice overlay · {active ? 'live' : 'idle'}</span>
              <IconButton label="Close preview" onClick={() => setPreview(false)}>
                <X size={15} />
              </IconButton>
            </div>
            <VoiceOverlay
              preview={{ ...session, phase: active ? session.phase : 'idle', message: '' }}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function Dictation({
  boot,
  session,
  onSettings,
  onPreview,
}: {
  boot: Bootstrap;
  session: Session;
  onSettings: () => void;
  onPreview: () => void;
}) {
  const recording = useRecording();
  const copy = useCopy();
  const active = isActive(session.phase);
  const finishing = session.phase === 'finishing' || session.phase === 'cleaning';
  const text = [session.text, session.interim].filter(Boolean).join(' ');
  const language =
    boot.settings.language === 'multi'
      ? 'Multilingual'
      : new Intl.DisplayNames(['en'], { type: 'language' }).of(boot.settings.language);
  const status =
    session.phase === 'cleaning'
      ? 'Cleaning up text'
      : finishing
        ? 'Finishing transcript'
        : active
          ? session.isTest
            ? 'Microphone test'
            : session.speechActive
              ? 'Speech detected'
              : 'Listening'
          : session.phase === 'error'
            ? 'Recording interrupted'
            : 'Ready to record';
  return (
    <>
      <div className="mb-7 flex items-center justify-between gap-5 [&_h1]:text-heading [&_h1]:font-semibold [&_h1]:tracking-[-.035em] [&_h1]:text-balance [&_p]:mt-2 [&_p]:text-ui [&_p]:text-muted max-[700px]:flex-wrap max-[700px]:items-start max-[700px]:gap-3 max-[700px]:[&_h1]:text-[26px]">
        <div>
          <h1>Dictation</h1>
          <p>Record here, or use your shortcut in another app.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onPreview}>
          <AudioLines size={16} /> Voice overlay <ArrowUpRight size={14} />
        </Button>
      </div>
      {!boot.hasKey && (
        <div className="mb-5 flex items-center gap-3 rounded-control bg-accent-soft px-4 py-3 text-accent-ink [&_strong]:text-ui [&_strong]:font-semibold [&_p]:mt-0.5 [&_p]:text-caption [&>button]:ml-auto max-[700px]:flex-wrap max-[700px]:[&>svg]:hidden max-[700px]:[&>button]:ml-0">
          <KeyRound size={18} />
          <div>
            <strong>Connect your transcription service</strong>
            <p>Add a Deepgram API key to start dictating.</p>
          </div>
          <Button size="sm" onClick={onSettings}>
            Connect <ArrowRight size={14} />
          </Button>
        </div>
      )}
      <section
        className="grid grid-cols-[224px_minmax(0,1fr)] overflow-hidden rounded-panel border border-line bg-surface min-[1280px]:grid-cols-[248px_minmax(0,1fr)] max-[1050px]:grid-cols-1"
        aria-label="Dictation workspace"
        data-active={active}
      >
        <div className="flex flex-col border-r border-line bg-subtle px-5 py-5 max-[1050px]:grid max-[1050px]:grid-cols-[minmax(0,1fr)_auto] max-[1050px]:gap-x-5 max-[1050px]:gap-y-3 max-[1050px]:border-r-0 max-[1050px]:border-b max-[700px]:gap-3 max-[700px]:p-4">
          <div className="flex items-center gap-2 text-ui font-medium max-[1050px]:col-start-1 [&>[data-status-dot]]:ml-auto max-[1050px]:[&>[data-status-dot]]:ml-1">
            <Mic size={16} />
            <span>Microphone</span>
            <span
              className="inline-block size-1.5 shrink-0 rounded-full bg-muted data-[live=true]:bg-accent"
              data-status-dot
              data-live={session.phase === 'listening'}
            />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center pt-9 pb-5 max-[1050px]:col-start-1 max-[1050px]:row-start-2 max-[1050px]:flex-row max-[1050px]:flex-wrap max-[1050px]:justify-start max-[1050px]:gap-x-3 max-[1050px]:gap-y-2 max-[1050px]:p-0">
            <Waveform level={session.level} active={session.phase === 'listening'} large />
            <span className="mt-5 text-[32px] leading-[1.1] font-[450] tracking-[-.035em] text-ink tabular-nums max-[1050px]:m-0 max-[1050px]:text-2xl max-[700px]:text-xl">
              {duration(session.elapsedMs)}
            </span>
            <span
              className="mt-2 text-caption text-muted max-[1050px]:m-0 max-[1050px]:w-full"
              role="status"
            >
              {status}
            </span>
          </div>
          <div className="flex flex-col items-stretch gap-2 [&_button]:px-3 max-[1050px]:col-start-2 max-[1050px]:row-span-2 max-[1050px]:row-start-1 max-[1050px]:justify-center max-[700px]:[&_button]:px-2.5 max-[700px]:[&_button]:text-xs">
            {active ? (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => recording.stop.mutate()}
                  loading={finishing || recording.stop.isPending}
                >
                  <Square size={12} fill="currentColor" /> Finish{' '}
                  {session.isTest ? 'test' : 'dictation'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => recording.cancel.mutate()}
                  disabled={recording.cancel.isPending}
                >
                  <X size={15} /> Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => (boot.hasKey ? recording.start.mutate(false) : onSettings())}
                  disabled={boot.hasKey && !native}
                  loading={recording.start.isPending}
                >
                  {boot.hasKey ? <Mic size={17} /> : <KeyRound size={16} />}
                  {boot.hasKey ? 'Start dictation' : 'Set up dictation'}
                </Button>
                <span className="flex min-h-9 items-center justify-center gap-2 text-caption text-muted">
                  or press <Shortcut />
                </span>
              </>
            )}
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 border-t border-line pt-4 text-caption text-muted [&>[data-status-dot]]:size-1 max-[1050px]:col-span-full max-[1050px]:m-0 max-[1050px]:justify-start max-[1050px]:pt-2.5">
            <span
              className="inline-block size-1.5 shrink-0 rounded-full bg-muted data-[live=true]:bg-accent"
              data-status-dot
            />
            {boot.settings.voiceDetection ? 'Silence detection on' : 'Continuous audio'}
          </div>
        </div>
        <div className="flex min-h-[392px] min-w-0 flex-col min-[1280px]:min-h-[460px] max-[1050px]:min-h-[300px]">
          <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4 text-caption text-muted [&>span:first-child]:flex [&>span:first-child]:items-center [&>span:first-child]:gap-2 [&>span:first-child]:font-medium [&>span:first-child]:text-ink max-[700px]:px-[18px]">
            <span>
              <FileText size={15} /> Transcript
            </span>
            <span>{language}</span>
          </div>
          <div
            className={clsx(
              'min-w-0 flex-1 px-7 py-8 max-[1050px]:p-6 max-[700px]:px-[18px]',
              !text &&
                'flex items-start [&>div]:pt-4 [&_h2]:text-title [&_h2]:font-medium [&_p]:mt-2 [&_p]:max-w-72 [&_p]:text-ui [&_p]:text-muted max-[1050px]:[&>div]:pt-0',
            )}
          >
            {text && !session.isTest ? (
              <p className="max-h-[370px] overflow-auto [overflow-wrap:anywhere] whitespace-pre-wrap text-transcript font-[440] tracking-[-.012em] max-[700px]:text-[17px]">
                <span>{session.text}</span>
                {session.interim && <span className="text-muted"> {session.interim}</span>}
                {active && (
                  <span
                    className="ml-1 inline-block h-5 w-0.5 translate-y-1 bg-accent"
                    aria-hidden="true"
                  />
                )}
              </p>
            ) : (
              <div>
                <span
                  className="mb-6 block h-8 w-0.5 bg-accent max-[1050px]:mb-4"
                  aria-hidden="true"
                />
                <h2>
                  {active
                    ? session.isTest
                      ? 'Test your microphone'
                      : 'Listening for your words…'
                    : 'Your transcript starts here'}
                </h2>
                <p>
                  {active
                    ? session.isTest
                      ? 'Speak to see your microphone level.'
                      : 'Speak naturally. Pauses are fine.'
                    : 'Start a dictation to turn speech into text.'}
                </p>
                {!active && (
                  <span className="mt-8 block max-w-64 text-caption text-muted max-[1050px]:mt-5">
                    Edit in your destination app after copying.
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex min-h-14 items-center justify-between gap-3 border-t border-line px-6 py-2 text-caption text-muted max-[700px]:px-[18px]">
            <span>{text ? `${text.trim().split(/\s+/).length} words` : 'No audio saved'}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copy.mutate(text)}
              disabled={!text}
              loading={copy.isPending}
            >
              <Copy size={14} /> Copy text
            </Button>
          </div>
        </div>
      </section>
      {session.originalText && !active && (
        <details className="my-4 text-ui text-muted [&_summary]:w-fit [&_summary]:cursor-pointer [&_summary]:py-1.5 [&_summary]:font-medium [&_p]:my-2 [&_p]:whitespace-pre-wrap [&_p]:[overflow-wrap:anywhere] [&_p]:text-body">
          <summary>Original transcript</summary>
          <p>{session.originalText}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copy.mutate(session.originalText!)}
            loading={copy.isPending}
          >
            <Copy size={14} /> Copy original
          </Button>
        </details>
      )}
      {session.message && (
        <div
          className={clsx(
            'mt-4 flex items-start gap-2 rounded-control bg-success-soft px-4 py-3 text-ui text-success [&>svg]:mt-0.5 [&>span]:min-w-0 [&>span]:[overflow-wrap:anywhere] [&_button]:ml-auto [&_button]:inline-flex [&_button]:shrink-0 [&_button]:items-center [&_button]:gap-1 [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-caption [&_button]:text-current',
            session.phase === 'error' && 'bg-danger-soft text-danger',
          )}
          role={session.phase === 'error' ? 'alert' : 'status'}
        >
          {session.phase === 'error' ? <CircleAlert size={17} /> : <Check size={17} />}
          <span>{session.message}</span>
          {session.phase === 'error' && (
            <button onClick={onSettings}>
              Settings <ArrowUpRight size={13} />
            </button>
          )}
        </div>
      )}
      <section
        className="mt-6 flex items-center gap-4 border-y border-line py-5 [&>svg]:text-muted [&_h2]:text-ui [&_h2]:font-semibold [&_p]:mt-1.5 [&_p]:text-caption [&_p]:text-muted [&>button]:ml-auto [&>button]:shrink-0 max-[1050px]:flex-wrap max-[1050px]:gap-3 max-[1050px]:[&>button]:ml-8 max-[700px]:[&>svg]:hidden max-[700px]:[&>button]:ml-0"
        aria-label="Dictate in another app"
      >
        <Keyboard size={20} strokeWidth={1.5} />
        <div>
          <h2>Dictate in any app</h2>
          <p>
            Place your cursor, press <Shortcut />, and speak. Press again to finish.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onSettings}>
          {boot.shortcutRegistered ? 'Shortcut settings' : 'Enable shortcut'}
          <ArrowRight size={14} />
        </Button>
      </section>
      <footer className="mt-5 flex items-center justify-between gap-4 text-caption text-muted [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 max-[700px]:flex-wrap max-[700px]:gap-2">
        <span>
          <ShieldCheck size={13} />
          {boot.settings.keepHistory ? 'History stays on this device' : 'Local history is off'}
        </span>
        <span>Deepgram Nova-3</span>
      </footer>
    </>
  );
}
