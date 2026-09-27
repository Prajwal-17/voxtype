import { useEffect, useState } from 'react';
import {
  AudioLines,
  History,
  Settings2,
  Mic,
  ArrowUpRight,
  Copy,
  Square,
  X,
  Check,
  ShieldCheck,
  ArrowRight,
  KeyRound,
  FileText,
  Keyboard,
  CircleHelp,
  CircleAlert,
} from 'lucide-react';
import clsx from 'clsx';
import { Button, Logo, Shortcut, IconButton } from './components/ui';
import { Waveform } from './components/waveform';
import { VoiceOverlay } from './components/overlay';
import { HistoryPage } from './pages/History';
import { SettingsPage } from './pages/Settings';
import { native, useBootstrap, useCopy, useRecording, useSession } from './lib/api';
import { duration, isActive, type Bootstrap, type Session } from './lib/types';
import { ui } from './design-system/classes';

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
    <div className={ui.appShell}>
      <aside className={ui.sidebar}>
        <Logo />
        <nav className={ui.nav} aria-label="Main navigation">
          {navigation.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={ui.navItem}
              aria-label={label}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => setPage(id)}
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>{label}</span>
              {page === id && <span className={ui.navIndicator} />}
            </button>
          ))}
        </nav>
        <div className={ui.sidebarBottom}>
          <button className={ui.sidebarShortcut} onClick={() => setPage('settings')}>
            <Keyboard size={17} />
            <span>Record anywhere</span>
            <Shortcut />
          </button>
          <div className={ui.personalNote}>
            <ShieldCheck size={16} />
            <div>
              <strong>Transcript history</strong>
              <span>
                {boot.data?.settings.keepHistory ? 'Saved on this device' : 'History off'}
              </span>
            </div>
          </div>
          <button className={ui.helpLink} onClick={() => setPage('settings')}>
            <CircleHelp size={15} />
            <span>Setup & help</span>
            <ArrowUpRight size={14} />
          </button>
        </div>
      </aside>
      <main className={ui.workspace}>
        <header className={ui.topbar}>
          <span className="font-medium">Personal workspace</span>
          <span className={ui.connectionStatus} data-active={session.phase === 'listening'}>
            <span className={ui.statusDot} data-status-dot />
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
          <div className={ui.previewNotice}>Browser preview · Open the desktop app to record.</div>
        )}
        <div className={ui.pageContent}>
          {boot.isPending ? (
            <div className={ui.loadingSurface} aria-label="Loading Flow">
              <div />
              <div />
              <div />
            </div>
          ) : boot.isError ? (
            <div className={ui.emptyState}>
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
          <div className={ui.overlayPreview}>
            <div className={ui.overlayPreviewHeading}>
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
      <div className={ui.pageHeading}>
        <div>
          <h1>Dictation</h1>
          <p>Record here, or use your shortcut in another app.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onPreview}>
          <AudioLines size={16} /> Voice overlay <ArrowUpRight size={14} />
        </Button>
      </div>
      {!boot.hasKey && (
        <div className={ui.connectBanner}>
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
      <section className={ui.dictationStudio} aria-label="Dictation workspace" data-active={active}>
        <div className={ui.recordingStation}>
          <div className={ui.stationHeading}>
            <Mic size={16} />
            <span>Microphone</span>
            <span
              className={ui.statusDot}
              data-status-dot
              data-live={session.phase === 'listening'}
            />
          </div>
          <div className={ui.stationSignal}>
            <Waveform level={session.level} active={session.phase === 'listening'} large />
            <span className={ui.stationTime}>{duration(session.elapsedMs)}</span>
            <span className={ui.stationStatus} role="status">
              {status}
            </span>
          </div>
          <div className={ui.recordControls}>
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
                <span className={ui.stationShortcut}>
                  or press <Shortcut />
                </span>
              </>
            )}
          </div>
          <div className={ui.stationDetail}>
            <span className={ui.statusDot} data-status-dot />
            {boot.settings.voiceDetection ? 'Silence detection on' : 'Continuous audio'}
          </div>
        </div>
        <div className={ui.transcriptEditor}>
          <div className={ui.surfaceTopline}>
            <span>
              <FileText size={15} /> Transcript
            </span>
            <span>{language}</span>
          </div>
          <div className={clsx(ui.transcriptArea, !text && ui.transcriptEmpty)}>
            {text && !session.isTest ? (
              <p className={ui.transcriptText}>
                <span>{session.text}</span>
                {session.interim && <span className="text-muted"> {session.interim}</span>}
                {active && <span className={ui.transcriptCaret} aria-hidden="true" />}
              </p>
            ) : (
              <div>
                <span className={ui.emptyCursor} aria-hidden="true" />
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
                  <span className={ui.transcriptEmptyHint}>
                    Edit in your destination app after copying.
                  </span>
                )}
              </div>
            )}
          </div>
          <div className={ui.surfaceFooter}>
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
        <details className={ui.originalTranscript}>
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
            ui.sessionNotice,
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
      <section className={ui.shortcutStrip} aria-label="Dictate in another app">
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
      <footer className={ui.pageFooter}>
        <span>
          <ShieldCheck size={13} />
          {boot.settings.keepHistory ? 'History stays on this device' : 'Local history is off'}
        </span>
        <span>Deepgram Nova-3</span>
      </footer>
    </>
  );
}
