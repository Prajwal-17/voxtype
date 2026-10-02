import {
  ArrowRightIcon,
  WaveformIcon,
  CheckIcon,
  WarningCircleIcon,
  CopyIcon,
  FileTextIcon,
  ClockCounterClockwiseIcon,
  KeyboardIcon,
  MicrophoneIcon,
  SlidersHorizontalIcon,
  StopIcon,
  UserCircleIcon,
  XIcon,
} from './components/icons';
import { useEffect, useState } from 'react';
import { DesignSwitcher } from './components/design-switcher';
import { useDesignTrial, type Design } from './lib/design-trial';
import { VoiceOverlay } from './components/overlay';
import { PageHeader, StatusDot } from './components/layout';
import { Button, IconButton, Logo, Shortcut } from './components/ui';
import { Card } from './components/ui/card';
import { Skeleton } from './components/ui/skeleton';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from './components/ui/sidebar';
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
  { id: 'dictation', icon: WaveformIcon, label: 'Dictation' },
  { id: 'history', icon: ClockCounterClockwiseIcon, label: 'History' },
  { id: 'settings', icon: SlidersHorizontalIcon, label: 'Settings' },
  { id: 'profile', icon: UserCircleIcon, label: 'Profile' },
] as const;

export function App() {
  const { design, setDesign } = useDesignTrial();
  return (
    <>
      <Application design={design} />
      <DesignSwitcher design={design} onChange={setDesign} />
    </>
  );
}

function Application({ design }: { design: Design }) {
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
    <Workspace
      design={design}
      user={auth.data}
      signingOut={signOut.isPending}
      onSignOut={() => signOut.mutate()}
    />
  );
}

function Workspace({
  design,
  user,
  signingOut,
  onSignOut,
}: {
  design: Design;
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
    <SidebarProvider className="desktop-workspace bg-canvas text-ink selection:bg-accent-soft selection:text-accent-ink">
      <Sidebar>
        <SidebarHeader className="pt-7 pb-8">
          <div className="flex h-10 items-center px-3 group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-0">
            <Logo
              collapse={false}
              className="group-data-[collapsible=icon]/sidebar:[&>span]:hidden"
            />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>WORKSPACE</SidebarGroupLabel>
            <nav aria-label="Main navigation">
              <SidebarMenu>
                {navigation.map(({ id, icon: Icon, label }) => (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton
                      isActive={page === id}
                      tooltip={label}
                      aria-label={label}
                      onClick={() => setPage(id)}
                    >
                      <Icon
                        size={20}
                        weight={page === id ? 'fill' : 'regular'}
                        aria-hidden="true"
                      />
                      <span className="group-data-[collapsible=icon]/sidebar:hidden">{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <button
            type="button"
            className="rounded-panel bg-navigation-raised p-4 text-left text-inverse hover:bg-navigation-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent group-data-[collapsible=icon]/sidebar:hidden"
            onClick={() => setPage('settings')}
          >
            <KeyboardIcon size={24} weight="duotone" aria-hidden="true" className="mb-3" />
            <span className="block text-ui font-semibold">Your voice, anywhere.</span>
            <span className="mt-1.5 block text-caption leading-relaxed text-inverse-muted">
              One shortcut. Any desktop app.
            </span>
            <span className="mt-4 block">
              <Shortcut label={boot.data?.shortcutLabel} />
            </span>
          </button>
          <SidebarMenuButton
            tooltip="Profile"
            aria-label="Open profile"
            onClick={() => setPage('profile')}
            className="mt-1"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-ink">
              {user.name.slice(0, 1)}
            </span>
            <span className="min-w-0 group-data-[collapsible=icon]/sidebar:hidden">
              <span className="block text-ui font-medium text-inverse">
                {user.name.split(' ')[0]}
              </span>
              <span className="block text-[11px] text-inverse-muted">Personal workspace</span>
            </span>
          </SidebarMenuButton>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="desktop-main min-h-screen">
        <header className="workspace-topbar flex h-16 items-center justify-between gap-4 border-b border-line px-8 text-caption text-muted">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <span className="h-4 w-px bg-line" aria-hidden="true" />
            <span className="text-ui font-medium text-ink">
              {navigation.find((item) => item.id === page)?.label}
            </span>
          </div>
          <span className="flex items-center gap-2 text-right">
            <span className="size-1.5 shrink-0 rounded-full bg-accent" />
            {native
              ? isDevelopment
                ? 'Development workspace'
                : 'Personal workspace'
              : 'Desktop preview · Recording available in the app'}
          </span>
        </header>

        <div className="workspace-content mx-auto w-full max-w-[1240px] px-8 pt-9 pb-48 max-md:px-5 max-md:py-7">
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
                  design={design}
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
          <div className="fixed right-6 bottom-48 z-40 w-[328px] max-w-[calc(100vw-2rem)] rounded-panel border border-line bg-surface p-3 shadow-floating max-md:right-4 max-md:bottom-4">
            <div className="flex items-center justify-between pl-1 text-caption text-muted">
              <span>Overlay preview · {active ? 'Live' : 'Idle'}</span>
              <IconButton label="Close preview" onClick={() => setPreview(false)}>
                <XIcon size={16} aria-hidden="true" />
              </IconButton>
            </div>
            <VoiceOverlay
              preview={{ ...session, phase: active ? session.phase : 'idle', message: '' }}
            />
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

function Dictation({
  design,
  boot,
  session,
  onSettings,
  onPreview,
}: {
  design: Design;
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
      <div className="dictation-heading">
        <p className="design-eyebrow mb-4 text-[10px] font-semibold tracking-[.18em] text-accent">
          {design.eyebrow}
        </p>
        <PageHeader
          title={design.title}
          description="Speak naturally. We’ll take it from here."
          actions={
            <Button variant="outline" size="sm" onClick={onPreview}>
              <WaveformIcon size={16} aria-hidden="true" /> Preview overlay
            </Button>
          }
        />
      </div>
      <div className="dictation-grid grid grid-cols-[minmax(0,1fr)_19rem] items-stretch gap-5 max-[960px]:grid-cols-1">
        <Card className="transcript-panel flex min-h-[420px] min-w-0 flex-col overflow-hidden max-[960px]:min-h-[420px]">
          <div className="transcript-topline flex min-h-14 items-center justify-between gap-4 border-b border-line px-5">
            <span className="flex items-center gap-2 text-ui font-semibold">
              <FileTextIcon size={16} className="text-muted" aria-hidden="true" /> Transcript
            </span>
            <span className="text-caption text-muted">{language}</span>
          </div>

          <div className="transcript-body min-w-0 flex-1 px-7 py-7 max-md:px-5 max-md:py-6">
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
              <div className="transcript-empty flex h-full min-h-[220px] flex-col justify-center">
                <span
                  className="empty-mark mb-6 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink"
                  aria-hidden="true"
                >
                  <WaveformIcon weight="duotone" size={24} aria-hidden="true" />
                </span>
                <h2 className="max-w-md text-subheading font-semibold tracking-[-.018em]">
                  {active
                    ? session.isTest
                      ? 'Test your microphone'
                      : 'Listening for your words…'
                    : 'A blank page. Endless possibilities.'}
                </h2>
                <p className="mt-2 max-w-md text-body text-muted">
                  {active
                    ? session.isTest
                      ? 'Speak naturally to see the live microphone level.'
                      : 'Start speaking when you’re ready. Natural pauses are fine.'
                    : 'An idea, a message, a first draft. Just say it out loud — your words will land right here.'}
                </p>
              </div>
            )}
          </div>

          <div className="transcript-footer flex min-h-14 items-center justify-between gap-3 border-t border-line bg-raised px-5 text-caption text-muted">
            <span>{text ? `${text.trim().split(/\s+/).length} words` : 'No audio is stored'}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copy.mutate(text)}
              disabled={!text}
              loading={copy.isPending}
            >
              <CopyIcon size={16} aria-hidden="true" /> Copy transcript
            </Button>
          </div>
        </Card>

        <Card className="recorder-panel flex min-h-[420px] flex-col p-5 max-[960px]:min-h-0">
          <div className="recorder-heading flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-ui font-semibold">
              <MicrophoneIcon size={16} className="text-muted" aria-hidden="true" /> Recorder
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

          <div className="recorder-visual flex flex-1 flex-col items-center justify-center py-6 max-[960px]:py-8">
            <div className="recorder-orbit flex items-center justify-center">
              {active ? (
                <Waveform level={session.level} active={session.phase === 'listening'} large />
              ) : (
                <MicrophoneIcon
                  weight="duotone"
                  size={40}
                  className="text-accent"
                  aria-hidden="true"
                />
              )}
            </div>
            <span className="mt-7 text-timer font-medium tracking-[-.025em] tabular-nums">
              {duration(session.elapsedMs)}
            </span>
            <span className="mt-2 text-caption text-muted" role="status">
              {active ? 'Press Escape to cancel' : 'Ready when you are'}
            </span>
          </div>

          <div className="recorder-actions space-y-2">
            {active ? (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => recording.stop.mutate()}
                  loading={finishing || recording.stop.isPending}
                >
                  <StopIcon size={12} weight="fill" aria-hidden="true" /> Finish{' '}
                  {session.isTest ? 'test' : 'dictation'}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => recording.cancel.mutate()}
                  disabled={recording.cancel.isPending}
                >
                  <XIcon size={16} aria-hidden="true" /> Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => recording.start.mutate(false)}
                  disabled={!native}
                  loading={recording.start.isPending}
                >
                  <MicrophoneIcon size={18} aria-hidden="true" /> Start dictation
                </Button>
                <div className="flex min-h-9 items-center justify-center gap-2 text-caption text-muted">
                  Or press <Shortcut label={boot.shortcutLabel} />
                </div>
              </>
            )}
          </div>

          <div className="recorder-detail mt-5 flex items-center justify-between border-t border-line pt-4 text-caption text-muted">
            <span>{boot.settings.voiceDetection ? 'Silence detection' : 'Continuous audio'}</span>
            <span className="font-medium text-ink">
              {boot.settings.voiceDetection ? 'On' : 'Off'}
            </span>
          </div>
        </Card>
      </div>

      <div className="workspace-notes mt-6 grid grid-cols-3 gap-6 border-t border-line pt-5 text-caption text-muted">
        <div className="flex gap-3">
          <span className="font-mono text-accent">01</span>
          <div>
            <span className="block font-medium text-ink">Speak your mind</span>
            <p className="mt-1">Use your shortcut from any app.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="font-mono text-accent">02</span>
          <div>
            <span className="block font-medium text-ink">Find your flow</span>
            <p className="mt-1">Natural pauses are always welcome.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="font-mono text-accent">03</span>
          <div>
            <span className="block font-medium text-ink">Make it yours</span>
            <p className="mt-1">Copy your words into whatever’s next.</p>
          </div>
        </div>
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
            <CopyIcon size={16} aria-hidden="true" /> Copy original
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
            <WarningCircleIcon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <CheckIcon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 [overflow-wrap:anywhere]">{session.message}</span>
          {session.phase === 'error' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSettings}
              className="ml-auto -my-1 text-current"
            >
              Settings <ArrowRightIcon size={13} aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </>
  );
}
