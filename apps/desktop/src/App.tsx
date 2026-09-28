import {
  ArrowRight,
  AudioLines,
  Check,
  CircleAlert,
  Copy,
  FileText,
  History,
  Keyboard,
  KeyRound,
  Mic,
  Settings2,
  Square,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { VoiceOverlay } from './components/overlay';
import { PageHeader, SidebarNavItem, StatusDot } from './components/layout';
import { Button, IconButton, Logo, Shortcut } from './components/ui';
import { Card } from './components/ui/card';
import { Skeleton } from './components/ui/skeleton';
import { Waveform } from './components/waveform';
import {
  native,
  useAuthActions,
  useAuthUser,
  useBootstrap,
  useCopy,
  useRecording,
  useSession,
} from './lib/api';
import {
  duration,
  errorMessage,
  isActive,
  type AuthUser,
  type Bootstrap,
  type Session,
} from './lib/types';
import { cn } from './lib/utils';
import { isDevelopment } from './lib/environment';
import { HistoryPage } from './pages/History';
import { LoginPage } from './pages/Login';
import { ProfilePage } from './pages/Profile';
import { SettingsPage } from './pages/Settings';

type Page = 'dictation' | 'history' | 'settings' | 'profile';

const navigation = [
  { id: 'dictation', icon: AudioLines, label: 'Dictation' },
  { id: 'history', icon: History, label: 'History' },
  { id: 'settings', icon: Settings2, label: 'Settings' },
  { id: 'profile', icon: UserRound, label: 'Profile' },
] as const;

export function App() {
  const auth = useAuthUser();
  const { signIn, signOut } = useAuthActions();

  if (!auth.data) {
    const error = signIn.error ?? auth.error;
    return (
      <LoginPage
        checking={auth.isPending}
        pending={signIn.isPending}
        error={error ? errorMessage(error) : undefined}
        onSignIn={() => signIn.mutate()}
      />
    );
  }

  return (
    <Workspace user={auth.data} signingOut={signOut.isPending} onSignOut={() => signOut.mutate()} />
  );
}

function Workspace({
  user,
  signingOut,
  onSignOut,
}: {
  user: AuthUser;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const [page, setPage] = useState<Page>('dictation');
  const [preview, setPreview] = useState(false);
  const boot = useBootstrap();
  const { data: session } = useSession();
  const active = isActive(session.phase);
  const { cancel } = useRecording();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (preview) {
        setPreview(false);
        return;
      }
      if (active) {
        event.preventDefault();
        cancel.mutate();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, preview, cancel]);

  return (
    <div className="min-h-screen bg-canvas text-ink selection:bg-accent-soft selection:text-accent-ink">
      <aside className="sidebar group fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-navigation-line bg-navigation p-4 text-inverse max-lg:w-20 max-lg:px-3">
        <div className="flex h-12 items-center px-2 max-lg:justify-center max-lg:px-0">
          <Logo />
        </div>

        <nav className="mt-7 flex flex-col gap-1" aria-label="Main navigation">
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

        <div className="mt-auto space-y-3 max-lg:hidden">
          <button
            type="button"
            className="w-full rounded-panel bg-navigation-raised p-3.5 text-left transition-colors hover:bg-navigation-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => setPage('settings')}
          >
            <span className="flex items-center gap-2 text-ui font-medium text-inverse">
              <Keyboard size={16} /> Dictate anywhere
            </span>
            <span className="mt-2.5 block">
              <Shortcut label={boot.data?.shortcutLabel} />
            </span>
          </button>
        </div>
        <div className="mt-auto hidden justify-center max-lg:flex">
          <IconButton
            label={`${boot.data?.shortcutLabel ?? 'Recording'} shortcut settings`}
            onClick={() => setPage('settings')}
            className="text-inverse-muted hover:bg-navigation-raised hover:text-inverse"
          >
            <Keyboard size={17} />
          </IconButton>
        </div>
      </aside>

      <main className="ml-60 min-h-screen min-w-0 max-lg:ml-20">
        {!native && (
          <div className="border-b border-warning/15 bg-warning-soft px-5 py-2 text-center text-caption font-medium text-warning">
            Browser preview · Open the desktop app to record.
          </div>
        )}
        {native && isDevelopment && (
          <div className="border-b border-warning/15 bg-warning-soft px-5 py-2 text-center text-caption font-medium text-warning">
            Development environment · Local backend and isolated app data
          </div>
        )}

        <div className="mx-auto w-full max-w-[1240px] px-8 py-9 max-md:px-5 max-md:py-7">
          {boot.isPending ? (
            <div className="flex flex-col gap-4 py-4" aria-label="Loading VoxType">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-5 w-80 max-w-full" />
              <div className="mt-5 grid grid-cols-[minmax(0,1fr)_19rem] gap-5 max-[960px]:grid-cols-1">
                <Skeleton className="h-[510px] w-full" />
                <Skeleton className="h-[510px] w-full" />
              </div>
            </div>
          ) : boot.isError ? (
            <Card className="mx-auto max-w-xl p-8 text-center">
              <h1 className="text-heading font-semibold tracking-[-.025em]">
                VoxType couldn’t load
              </h1>
              <p className="mx-auto mt-3 mb-6 max-w-md text-body text-muted">
                VoxType couldn’t load its local configuration. Your saved settings and history are
                still on this device.
              </p>
              <Button variant="primary" onClick={() => void boot.refetch()}>
                Try again
              </Button>
            </Card>
          ) : boot.data ? (
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
              {page === 'profile' && (
                <ProfilePage user={user} signingOut={signingOut} onSignOut={onSignOut} />
              )}
            </>
          ) : null}
        </div>

        {preview && page === 'dictation' && (
          <div className="fixed right-6 bottom-6 z-40 w-[328px] max-w-[calc(100vw-2rem)] rounded-panel border border-line bg-surface p-3 shadow-floating max-md:right-4 max-md:bottom-4">
            <div className="flex items-center justify-between pl-1 text-caption text-muted">
              <span>Overlay preview · {active ? 'Live' : 'Idle'}</span>
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
            : boot.hasKey
              ? 'Ready to record'
              : 'Setup needed';

  return (
    <>
      <PageHeader
        title="Dictation"
        description="Speak here or use your shortcut from any desktop app."
        actions={
          <Button variant="outline" size="sm" onClick={onPreview}>
            <AudioLines size={15} /> Preview overlay
          </Button>
        }
      />

      {!boot.hasKey && (
        <div className="mb-5 flex items-center gap-3 rounded-panel border border-accent/15 bg-accent-soft px-4 py-3.5 text-accent-ink max-md:flex-wrap">
          <KeyRound size={18} className="shrink-0" />
          <div className="min-w-0">
            <strong className="text-ui font-semibold">Connect Deepgram to start dictating</strong>
            <p className="mt-0.5 text-caption opacity-80">
              Your key is stored securely in the desktop keyring.
            </p>
          </div>
          <Button size="sm" variant="primary" onClick={onSettings} className="ml-auto max-md:ml-0">
            Open settings <ArrowRight size={14} />
          </Button>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_19rem] items-stretch gap-5 max-[960px]:grid-cols-1">
        <Card className="flex min-h-[520px] min-w-0 flex-col overflow-hidden max-[960px]:min-h-[420px]">
          <div className="flex min-h-14 items-center justify-between gap-4 border-b border-line px-5">
            <span className="flex items-center gap-2 text-ui font-semibold">
              <FileText size={15} className="text-muted" /> Transcript
            </span>
            <span className="text-caption text-muted">{language}</span>
          </div>

          <div className="min-w-0 flex-1 px-7 py-7 max-md:px-5 max-md:py-6">
            {text && !session.isTest ? (
              <p className="max-h-[390px] overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] text-transcript font-transcript tracking-[-.01em]">
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
              <div className="flex h-full min-h-[260px] flex-col justify-center">
                <span className="mb-5 block h-1 w-10 rounded-full bg-accent" aria-hidden="true" />
                <h2 className="max-w-md text-subheading font-semibold tracking-[-.018em]">
                  {active
                    ? session.isTest
                      ? 'Test your microphone'
                      : 'Listening for your words…'
                    : 'Your transcript will appear here'}
                </h2>
                <p className="mt-2 max-w-md text-body text-muted">
                  {active
                    ? session.isTest
                      ? 'Speak naturally to see the live microphone level.'
                      : 'Start speaking when you’re ready. Natural pauses are fine.'
                    : 'Start a dictation, then speak naturally. VoxType will keep the text ready to copy or paste.'}
                </p>
              </div>
            )}
          </div>

          <div className="flex min-h-14 items-center justify-between gap-3 border-t border-line bg-raised px-5 text-caption text-muted">
            <span>{text ? `${text.trim().split(/\s+/).length} words` : 'No audio is stored'}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copy.mutate(text)}
              disabled={!text}
              loading={copy.isPending}
            >
              <Copy size={14} /> Copy transcript
            </Button>
          </div>
        </Card>

        <Card className="flex min-h-[520px] flex-col p-5 max-[960px]:min-h-0">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-ui font-semibold">
              <Mic size={15} className="text-muted" /> Recorder
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full bg-subtle px-2.5 py-1 text-caption font-medium text-muted',
                active && 'bg-accent-soft text-accent-ink',
                session.phase === 'error' && 'bg-danger-soft text-danger',
              )}
            >
              <StatusDot live={session.phase === 'listening'} /> {status}
            </span>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center py-10 max-[960px]:py-8">
            <Waveform level={session.level} active={session.phase === 'listening'} large />
            <span className="mt-7 text-timer font-medium tracking-[-.025em] tabular-nums">
              {duration(session.elapsedMs)}
            </span>
            <span className="mt-2 text-caption text-muted" role="status">
              {active
                ? 'Press Escape to cancel'
                : boot.hasKey
                  ? 'Ready when you are'
                  : 'Add a Deepgram key to begin'}
            </span>
          </div>

          <div className="space-y-2">
            {active ? (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => recording.stop.mutate()}
                  loading={finishing || recording.stop.isPending}
                >
                  <Square size={12} fill="currentColor" /> Finish{' '}
                  {session.isTest ? 'test' : 'dictation'}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
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
                  className="w-full"
                  onClick={() => (boot.hasKey ? recording.start.mutate(false) : onSettings())}
                  disabled={boot.hasKey && !native}
                  loading={recording.start.isPending}
                >
                  {boot.hasKey ? <Mic size={17} /> : <KeyRound size={16} />}
                  {boot.hasKey ? 'Start dictation' : 'Set up dictation'}
                </Button>
                <div className="flex min-h-9 items-center justify-center gap-2 text-caption text-muted">
                  Or press <Shortcut label={boot.shortcutLabel} />
                </div>
              </>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-caption text-muted">
            <span>{boot.settings.voiceDetection ? 'Silence detection' : 'Continuous audio'}</span>
            <span className="font-medium text-ink">
              {boot.settings.voiceDetection ? 'On' : 'Off'}
            </span>
          </div>
        </Card>
      </div>

      {session.originalText && !active && (
        <details className="mt-5 rounded-panel border border-line bg-surface px-5 py-4 text-ui text-muted">
          <summary className="w-fit cursor-pointer font-medium text-ink">
            Original transcript
          </summary>
          <p className="my-3 whitespace-pre-wrap [overflow-wrap:anywhere] text-body">
            {session.originalText}
          </p>
          <Button
            variant="outline"
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
            'mt-5 flex items-start gap-2 rounded-panel bg-success-soft px-4 py-3 text-ui text-success',
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
            <Button
              variant="ghost"
              size="sm"
              onClick={onSettings}
              className="ml-auto -my-1 text-current"
            >
              Settings <ArrowRight size={13} />
            </Button>
          )}
        </div>
      )}
    </>
  );
}
