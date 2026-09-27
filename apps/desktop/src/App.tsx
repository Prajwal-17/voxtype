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
import { PageHeader, SidebarNavItem, StatusDot } from './components/layout';
import { Button, IconButton, Logo, Shortcut } from './components/ui';
import { Skeleton } from './components/ui/skeleton';
import { Waveform } from './components/waveform';
import { native, useBootstrap, useCopy, useRecording, useSession } from './lib/api';
import { duration, isActive, type Bootstrap, type Session } from './lib/types';
import { cn } from './lib/utils';
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
      <aside className="sidebar group fixed inset-y-0 left-0 z-10 flex w-48 shrink-0 flex-col bg-graphite px-3 py-7 text-inverse max-lg:w-44 max-md:w-16 max-md:px-2 max-md:py-5">
        <div className="mb-12 ml-3 max-md:mx-0 max-md:mb-8 max-md:justify-center max-md:flex">
          <Logo />
        </div>
        <nav className="flex flex-col gap-1" aria-label="Main navigation">
          {navigation.map(({ id, icon, label }) => (
            <SidebarNavItem
              key={id}
              icon={icon}
              label={label}
              active={page === id}
              onClick={() => setPage(id)}
            />
          ))}
        </nav>
        <div className="mt-auto pt-12 max-md:hidden">
          <button
            className="mb-5 grid w-full grid-cols-[16px_1fr] items-center gap-x-2 gap-y-2 rounded-control border border-graphite-line bg-transparent px-3 py-3 text-left text-caption text-inverse-muted hover:text-inverse"
            onClick={() => setPage('settings')}
          >
            <Keyboard size={17} />
            <span>Record anywhere</span>
            <span className="col-start-2">
              <Shortcut />
            </span>
          </button>
          <div className="flex items-center gap-2.5 border-t border-graphite-line px-2 pt-5">
            <ShieldCheck size={16} className="shrink-0 text-inverse-muted" />
            <div>
              <strong className="block text-caption font-medium text-inverse">
                Transcript history
              </strong>
              <span className="mt-1 block text-caption text-inverse-muted">
                {boot.data?.settings.keepHistory ? 'Saved on this device' : 'History off'}
              </span>
            </div>
          </div>
          <button
            className="mt-5 flex w-full items-center gap-2 border-0 bg-transparent px-2 text-caption text-inverse-muted hover:text-inverse"
            onClick={() => setPage('settings')}
          >
            <CircleHelp size={15} />
            <span>Setup & help</span>
            <ArrowUpRight size={14} className="ml-auto" />
          </button>
        </div>
      </aside>
      <main className="ml-48 min-w-0 flex-1 max-lg:ml-44 max-md:ml-16">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-line px-9 text-caption text-muted max-lg:px-6 max-md:px-4">
          <span className="font-medium">Personal workspace</span>
          <span
            className={cn(
              'flex items-center gap-2 max-md:text-[11px]',
              session.phase === 'listening' && 'text-accent',
            )}
          >
            <StatusDot live={session.phase === 'listening'} />
            {session.phase === 'listening'
              ? 'Microphone on'
              : active
                ? 'Processing transcript'
                : boot.data?.hasKey
                  ? 'Ready to dictate'
                  : 'Setup required'}
            <span className="ml-3 border-l border-line pl-4 tabular-nums max-md:hidden">
              v{boot.data?.version ?? '0.1.0'}
            </span>
          </span>
        </header>
        {!native && (
          <div className="bg-warning-soft px-5 py-2 text-center text-caption text-warning">
            Browser preview · Open the desktop app to record.
          </div>
        )}
        <div className="mx-auto max-w-6xl px-9 pt-9 pb-7 xl:pt-12 max-lg:px-6 max-lg:py-7 max-md:px-4 max-md:py-6">
          {boot.isPending ? (
            <div className="flex flex-col gap-5 py-5" aria-label="Loading Flow">
              <Skeleton className="h-6 w-2/5" />
              <Skeleton className="h-6 w-2/5" />
              <Skeleton className="h-72 w-full" />
            </div>
          ) : boot.isError ? (
            <div className="px-5 py-16">
              <h1 className="text-heading font-semibold">Flow couldn’t load.</h1>
              <p className="mt-3 mb-6 text-muted">{String(boot.error)}</p>
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
          <div className="fixed bottom-7 left-[calc(50%+6rem)] z-20 w-[min(240px,calc(100vw-12rem-24px))] -translate-x-1/2 p-2 max-lg:left-[calc(50%+5.5rem)] max-lg:w-[min(240px,calc(100vw-11rem-24px))] max-md:left-[calc(50%+2rem)] max-md:w-[min(240px,calc(100vw-4rem-24px))]">
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
      <PageHeader
        title="Dictation"
        description="Record here, or use your shortcut in another app."
        actions={
          <Button variant="ghost" size="sm" onClick={onPreview}>
            <AudioLines size={16} /> Voice overlay <ArrowUpRight size={14} />
          </Button>
        }
      />
      {!boot.hasKey && (
        <div className="mb-5 flex items-center gap-3 rounded-control bg-accent-soft px-4 py-3 text-accent-ink max-md:flex-wrap">
          <KeyRound size={18} className="shrink-0 max-md:hidden" />
          <div>
            <strong className="text-ui font-semibold">Connect your transcription service</strong>
            <p className="mt-0.5 text-caption">Add a Deepgram API key to start dictating.</p>
          </div>
          <Button size="sm" onClick={onSettings} className="ml-auto max-md:ml-0">
            Connect <ArrowRight size={14} />
          </Button>
        </div>
      )}
      <section
        className="grid grid-cols-[224px_minmax(0,1fr)] overflow-hidden rounded-panel border border-line bg-surface xl:grid-cols-[248px_minmax(0,1fr)] max-lg:grid-cols-1"
        aria-label="Dictation workspace"
        data-active={active}
      >
        <div className="flex flex-col border-r border-line bg-subtle px-5 py-5 max-lg:grid max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-x-5 max-lg:gap-y-3 max-lg:border-r-0 max-lg:border-b max-md:gap-3 max-md:p-4">
          <div className="flex items-center gap-2 text-ui font-medium max-lg:col-start-1">
            <Mic size={16} />
            <span>Microphone</span>
            <StatusDot live={session.phase === 'listening'} className="ml-auto max-lg:ml-1" />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center pt-9 pb-5 max-lg:col-start-1 max-lg:row-start-2 max-lg:flex-row max-lg:flex-wrap max-lg:justify-start max-lg:gap-x-3 max-lg:gap-y-2 max-lg:p-0">
            <Waveform level={session.level} active={session.phase === 'listening'} large />
            <span className="mt-5 text-[32px] leading-[1.1] font-[450] tracking-[-.035em] text-ink tabular-nums max-lg:m-0 max-lg:text-2xl max-md:text-xl">
              {duration(session.elapsedMs)}
            </span>
            <span className="mt-2 text-caption text-muted max-lg:m-0 max-lg:w-full" role="status">
              {status}
            </span>
          </div>
          <div className="flex flex-col items-stretch gap-2 max-lg:col-start-2 max-lg:row-span-2 max-lg:row-start-1 max-lg:justify-center">
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
          <div className="mt-6 flex items-center justify-center gap-2 border-t border-line pt-4 text-caption text-muted max-lg:col-span-full max-lg:m-0 max-lg:justify-start max-lg:pt-2.5">
            <StatusDot />
            {boot.settings.voiceDetection ? 'Silence detection on' : 'Continuous audio'}
          </div>
        </div>
        <div className="flex min-h-[392px] min-w-0 flex-col xl:min-h-[460px] max-lg:min-h-[300px]">
          <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4 text-caption text-muted max-md:px-[18px]">
            <span className="flex items-center gap-2 font-medium text-ink">
              <FileText size={15} /> Transcript
            </span>
            <span>{language}</span>
          </div>
          <div className={cn('min-w-0 flex-1 px-7 py-8 max-lg:p-6 max-md:px-[18px]')}>
            {text && !session.isTest ? (
              <p className="max-h-[370px] overflow-auto [overflow-wrap:anywhere] whitespace-pre-wrap text-transcript font-[440] tracking-[-.012em] max-md:text-[17px]">
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
              <div className="pt-4 max-lg:pt-0">
                <span className="mb-6 block h-8 w-0.5 bg-accent max-lg:mb-4" aria-hidden="true" />
                <h2 className="text-title font-medium">
                  {active
                    ? session.isTest
                      ? 'Test your microphone'
                      : 'Listening for your words…'
                    : 'Your transcript starts here'}
                </h2>
                <p className="mt-2 max-w-72 text-ui text-muted">
                  {active
                    ? session.isTest
                      ? 'Speak to see your microphone level.'
                      : 'Speak naturally. Pauses are fine.'
                    : 'Start a dictation to turn speech into text.'}
                </p>
                {!active && (
                  <span className="mt-8 block max-w-64 text-caption text-muted max-lg:mt-5">
                    Edit in your destination app after copying.
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex min-h-14 items-center justify-between gap-3 border-t border-line px-6 py-2 text-caption text-muted max-md:px-[18px]">
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
        <details className="my-4 text-ui text-muted">
          <summary className="w-fit cursor-pointer py-1.5 font-medium">Original transcript</summary>
          <p className="my-2 whitespace-pre-wrap [overflow-wrap:anywhere] text-body">
            {session.originalText}
          </p>
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
          className={cn(
            'mt-4 flex items-start gap-2 rounded-control bg-success-soft px-4 py-3 text-ui text-success',
            session.phase === 'error' && 'bg-danger-soft text-danger',
          )}
          role={session.phase === 'error' ? 'alert' : 'status'}
        >
          {session.phase === 'error' ? (
            <CircleAlert size={17} className="mt-0.5 shrink-0" />
          ) : (
            <Check size={17} className="mt-0.5 shrink-0" />
          )}
          <span className="min-w-0 [overflow-wrap:anywhere]">{session.message}</span>
          {session.phase === 'error' && (
            <button
              onClick={onSettings}
              className="ml-auto inline-flex shrink-0 items-center gap-1 border-0 bg-transparent text-caption text-current"
            >
              Settings <ArrowUpRight size={13} />
            </button>
          )}
        </div>
      )}
      <section
        className="mt-6 flex items-center gap-4 border-y border-line py-5 max-lg:flex-wrap max-lg:gap-3"
        aria-label="Dictate in another app"
      >
        <Keyboard size={20} strokeWidth={1.5} className="shrink-0 text-muted max-md:hidden" />
        <div>
          <h2 className="text-ui font-semibold">Dictate in any app</h2>
          <p className="mt-1.5 text-caption text-muted">
            Place your cursor, press <Shortcut />, and speak. Press again to finish.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onSettings} className="ml-auto shrink-0">
          {boot.shortcutRegistered ? 'Shortcut settings' : 'Enable shortcut'}
          <ArrowRight size={14} />
        </Button>
      </section>
      <footer className="mt-5 flex items-center justify-between gap-4 text-caption text-muted max-md:flex-wrap max-md:gap-2">
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={13} />
          {boot.settings.keepHistory ? 'History stays on this device' : 'Local history is off'}
        </span>
        <span>Deepgram Nova-3</span>
      </footer>
    </>
  );
}
