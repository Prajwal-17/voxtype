import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MicrophoneIcon, ArrowsClockwiseIcon, StopIcon } from '../components/icons';
import { toast } from 'sonner';
import { api, native, useRecording, useSession } from '../lib/api';
import { captureShortcut } from '../lib/shortcuts';
import { cn } from '../lib/utils';
import { parseVocabulary, settingsSchema, type Bootstrap, type Settings } from '../lib/types';
import { Button, IconButton, Toggle } from '../components/ui';
import { FieldRow, PageHeader, SectionHeader } from '../components/layout';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Waveform } from '../components/waveform';

export function SettingsPage({
  boot,
  active,
  onDirtyChange,
}: {
  boot: Bootstrap;
  active: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [tab, setTab] = useState<'voice' | 'workflow' | 'desktop'>('voice');
  const [preferencesDirty, setPreferencesDirty] = useState(false),
    [shortcutDirty, setShortcutDirty] = useState(false);
  useEffect(() => {
    onDirtyChange(preferencesDirty || shortcutDirty);
  }, [preferencesDirty, shortcutDirty, onDirtyChange]);
  useEffect(() => {
    if (!preferencesDirty && !shortcutDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [preferencesDirty, shortcutDirty]);
  return (
    <>
      <PageHeader title="Settings" />
      <div
        className="mb-5 flex flex-wrap gap-1 rounded-control bg-subtle p-1"
        role="tablist"
        aria-label="Settings categories"
      >
        {(
          [
            ['voice', 'Voice & language'],
            ['workflow', 'Workflow'],
            ['desktop', 'Desktop'],
          ] as const
        ).map(([id, label], index) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              const tabs = ['voice', 'workflow', 'desktop'] as const;
              const next =
                e.key === 'ArrowRight'
                  ? (index + 1) % 3
                  : e.key === 'ArrowLeft'
                    ? (index + 2) % 3
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? 2
                        : -1;
              if (next >= 0) {
                e.preventDefault();
                setTab(tabs[next]!);
                document.getElementById(`tab-${tabs[next]}`)?.focus();
              }
            }}
            className={`min-h-10 rounded-menu-item px-4 text-ui focus-visible:outline-2 focus-visible:outline-accent ${tab === id ? 'bg-surface font-semibold text-accent' : 'text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="max-w-3xl">
        <Preferences
          key={JSON.stringify(boot.settings)}
          settings={boot.settings}
          tab={tab}
          onDirtyChange={setPreferencesDirty}
          active={active}
          startupAvailable={boot.startupAvailable}
        />
        <div hidden={tab !== 'desktop'}>
          <DesktopSetup boot={boot} active={active} onDirtyChange={setShortcutDirty} />
          <LocalDiagnostics />
        </div>
      </div>
      <p className="mt-5 text-caption text-muted">
        VoxType{boot.environment === 'development' ? ' Dev' : ''} · {boot.version}
      </p>
    </>
  );
}

const LANGUAGES = [
  ['en', 'English'],
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
  ['hi', 'Hindi'],
  ['multi', 'Multilingual'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['pt', 'Portuguese'],
  ['ja', 'Japanese'],
] as const;

function Preferences({
  settings,
  active,
  startupAvailable,
  tab,
  onDirtyChange,
}: {
  settings: Settings;
  active: boolean;
  startupAvailable: boolean;
  tab: 'voice' | 'workflow' | 'desktop';
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [vocabulary, setVocabulary] = useState(settings.vocabulary.join('\n'));
  const client = useQueryClient();
  const recording = useRecording();
  const { data: session } = useSession();
  const microphones = useQuery({ queryKey: ['microphones'], queryFn: api.microphones });
  const save = useMutation({
    mutationFn: api.settings,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['bootstrap'] });
      void client.invalidateQueries({ queryKey: ['diagnostics'] });
      toast.success('Preferences saved');
    },
  });
  const value = { ...draft, vocabulary: parseVocabulary(vocabulary) };
  const dirty = JSON.stringify(value) !== JSON.stringify(settings);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  const set = <K extends keyof Settings>(field: K, value: Settings[K]) =>
    setDraft((previous) => ({ ...previous, [field]: value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = settingsSchema.safeParse(value);
        if (!parsed.success) {
          toast.error(parsed.error.issues[0]?.message ?? 'Check your preference values.');
          return;
        }
        save.mutate(parsed.data);
      }}
    >
      <section
        hidden={tab !== 'voice'}
        id="panel-voice"
        role="tabpanel"
        aria-labelledby="tab-voice"
        className="mb-5 rounded-panel border border-line bg-surface p-5 max-md:p-4"
      >
        <SectionHeader title="Voice & language" />
        <FieldRow label="Microphone" htmlFor="microphone">
          <div className="flex shrink-0 items-center gap-1.5 max-md:w-full max-md:max-w-full">
            <Select
              value={draft.microphone || '__default'}
              onValueChange={(v) => set('microphone', v === '__default' ? '' : v)}
              disabled={active}
            >
              <SelectTrigger id="microphone" aria-label="Microphone">
                <SelectValue placeholder="System default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default">System default</SelectItem>
                {microphones.data?.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
                {draft.microphone && !microphones.data?.some((m) => m.id === draft.microphone) && (
                  <SelectItem value={draft.microphone}>Saved microphone (not connected)</SelectItem>
                )}
              </SelectContent>
            </Select>
            <IconButton
              type="button"
              label="Refresh microphones"
              onClick={() => void microphones.refetch()}
              disabled={microphones.isFetching}
            >
              <ArrowsClockwiseIcon
                size={16}
                className={microphones.isFetching ? 'animate-spin' : ''}
                aria-hidden="true"
              />
            </IconButton>
          </div>
        </FieldRow>
        {microphones.isError && (
          <p className="mt-2 text-ui text-danger">
            VoxType couldn’t list microphones. Check that one is connected, then refresh.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-control bg-subtle px-3 py-2.5">
          <div className="mr-auto flex items-center gap-2 text-caption text-muted">
            <MicrophoneIcon size={16} aria-hidden="true" />
            <span>
              {session.isTest && active
                ? 'Listening to your microphone…'
                : dirty
                  ? 'Save before testing'
                  : 'Microphone test'}
            </span>
          </div>
          <Waveform level={session.isTest ? session.level : 0} active={session.isTest && active} />
          <Button
            type="button"
            variant="ghost"
            disabled={!native || (active && !session.isTest) || dirty}
            loading={recording.pending}
            onClick={() =>
              session.isTest && active ? recording.stop.mutate() : recording.start.mutate(true)
            }
          >
            {session.isTest && active ? <StopIcon size={12} aria-hidden="true" /> : null}
            {session.isTest && active ? 'Stop test' : 'Test mic'}
          </Button>
        </div>
        {session.isTest && session.message && (
          <p
            className={cn(
              session.phase === 'error'
                ? 'mt-2 text-ui text-danger'
                : 'mt-2 flex items-center gap-1.5 text-caption text-muted',
            )}
            role={session.phase === 'error' ? 'alert' : 'status'}
          >
            {session.message}
          </p>
        )}
        <FieldRow label="Language" htmlFor="language">
          <Select
            value={draft.language}
            onValueChange={(v) => set('language', v as Settings['language'])}
            disabled={active}
          >
            <SelectTrigger id="language" aria-label="Language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map(([langValue, label]) => (
                <SelectItem key={langValue} value={langValue}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      </section>
      <section
        hidden={tab !== 'workflow'}
        id="panel-workflow"
        role="tabpanel"
        aria-labelledby="tab-workflow"
        className="mb-5 rounded-panel border border-line bg-surface p-5 max-md:p-4"
      >
        <SectionHeader title="Workflow" />
        <Toggle
          label="Skip long pauses"
          checked={draft.voiceDetection}
          onChange={(v) => set('voiceDetection', v)}
          disabled={active}
        />
        <Toggle
          label="Paste when I finish"
          checked={draft.autoPaste}
          onChange={(v) => set('autoPaste', v)}
          disabled={active}
        />
        <Toggle
          label="Clean up wording"
          checked={draft.cleanupEnabled}
          onChange={(v) => set('cleanupEnabled', v)}
          disabled={active}
        />
      </section>
      <section
        hidden={tab !== 'voice'}
        className="mb-5 rounded-panel border border-line bg-surface p-5 max-md:p-4"
      >
        <SectionHeader title="Personal vocabulary" />
        <Label className="sr-only" htmlFor="vocabulary">
          Personal vocabulary
        </Label>
        <Textarea
          id="vocabulary"
          rows={4}
          placeholder={'One word or phrase per line'}
          value={vocabulary}
          onChange={(e) => setVocabulary(e.target.value)}
          disabled={active}
        />
        <div className="mt-2 flex justify-between gap-3 text-caption text-muted max-md:flex-col max-md:gap-1">
          <span>{value.vocabulary.length} / 100 terms</span>
        </div>
      </section>
      <section
        hidden={tab !== 'desktop'}
        id="panel-desktop"
        role="tabpanel"
        aria-labelledby="tab-desktop"
        className="mb-5 rounded-panel border border-line bg-surface p-5"
      >
        <Toggle
          label="Launch at login"
          checked={draft.launchAtLogin}
          onChange={(v) => set('launchAtLogin', v)}
          disabled={active || !startupAvailable}
        />
        {!startupAvailable && (
          <p className="mt-3 text-caption text-muted">Available in the installed app.</p>
        )}
      </section>
      {(dirty || active) && (
        <div className="settings-save-bar sticky bottom-4 z-10 mb-5 flex items-center justify-between gap-3 rounded-panel border border-line bg-surface px-4 py-3 text-caption text-muted shadow-panel">
          <span>
            {active ? 'Finish recording to change preferences.' : dirty ? 'Unsaved changes' : ''}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={save.isPending || active}
              onClick={() => {
                setDraft(settings);
                setVocabulary(settings.vocabulary.join('\n'));
              }}
            >
              Discard
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={save.isPending}
              disabled={!dirty || active || !native}
            >
              Save changes
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

function DesktopSetup({
  boot,
  active,
  onDirtyChange,
}: {
  boot: Bootstrap;
  active: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [shortcutId, setShortcutId] = useState(boot.shortcutId);
  useEffect(() => {
    onDirtyChange(shortcutId !== boot.shortcutId);
  }, [shortcutId, boot.shortcutId, onDirtyChange]);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [customLabel, setCustomLabel] = useState<string | null>(null);
  const customOption =
    shortcutId.startsWith('custom:') &&
    !boot.shortcutOptions.some((option) => option.id === shortcutId)
      ? { id: shortcutId, label: customLabel ?? 'Custom shortcut' }
      : null;
  const client = useQueryClient();
  const configure = useMutation({
    mutationFn: api.configureShortcut,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['bootstrap'] });
      void client.invalidateQueries({ queryKey: ['diagnostics'] });
      toast.success('Recording shortcut updated');
    },
  });
  const checks = useQuery({
    queryKey: ['diagnostics'],
    queryFn: api.diagnostics,
    staleTime: 60_000,
  });
  return (
    <section className="mb-7 rounded-panel border border-line bg-surface p-5 max-md:p-4">
      <div className="mb-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-title font-semibold tracking-[-.02em]">Shortcut</h2>
          <Button variant="ghost" onClick={() => void checks.refetch()} loading={checks.isFetching}>
            <ArrowsClockwiseIcon size={16} aria-hidden="true" /> Check again
          </Button>
        </div>
      </div>
      <div className="mb-5 flex items-center justify-between gap-6 rounded-control bg-subtle p-4 max-lg:gap-4 max-md:flex-wrap">
        <div className="min-w-0">
          <Label>Recording shortcut</Label>
          <div className="mt-3 flex items-center gap-3 max-md:flex-wrap">
            <Select
              value={shortcutId}
              onValueChange={setShortcutId}
              disabled={active || configure.isPending}
            >
              <SelectTrigger aria-label="Recording shortcut" className="w-56 max-md:w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {boot.shortcutOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
                {customOption && (
                  <SelectItem value={customOption.id}>{customOption.label}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={active || configure.isPending || !native}
              aria-pressed={recordingShortcut}
              onClick={() => setRecordingShortcut(true)}
              onBlur={() => setRecordingShortcut(false)}
              onKeyDown={(event) => {
                if (!recordingShortcut) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.key === 'Escape') {
                  setRecordingShortcut(false);
                  return;
                }
                const captured = captureShortcut(event.nativeEvent);
                if (captured) {
                  setShortcutId(captured.id);
                  setCustomLabel(captured.label);
                  setRecordingShortcut(false);
                }
              }}
              onKeyUp={(event) => {
                if (recordingShortcut && event.code === 'AltRight') {
                  event.preventDefault();
                  setShortcutId('right-alt');
                  setRecordingShortcut(false);
                }
              }}
            >
              {recordingShortcut ? 'Press shortcut…' : 'Record custom shortcut'}
            </Button>
          </div>
          {recordingShortcut && (
            <p className="mt-2 text-caption text-muted" role="status">
              Press a key combination. Esc cancels. Right Alt works by itself.
            </p>
          )}
        </div>
        <Button
          onClick={() => configure.mutate(shortcutId)}
          variant={boot.shortcutRegistered ? 'secondary' : 'primary'}
          disabled={
            !native || active || (boot.shortcutRegistered && shortcutId === boot.shortcutId)
          }
          loading={configure.isPending}
        >
          Save shortcut
        </Button>
      </div>
      {checks.data
        ?.filter((check) => check.status !== 'ok')
        .map((check) => (
          <p key={check.name} className="mt-3 text-ui text-warning">
            {check.detail}
          </p>
        ))}
    </section>
  );
}

function LocalDiagnostics() {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Diagnostics unavailable');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mb-5 rounded-panel border border-line bg-surface p-5">
      <h2 className="text-title font-semibold">Local diagnostics</h2>
      <p className="my-3 text-ui text-muted">
        Recording and delivery events from the last 14 days, up to 500 events. Text, credentials and
        target app details are excluded. Diagnostics stay on this device.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy || !native}
          onClick={() =>
            void run(async () => {
              await api.copy(await api.localDiagnostics());
              toast.success('Diagnostics copied');
            })
          }
        >
          Copy diagnostics
        </Button>
        <Button
          variant="outline"
          disabled={busy || !native}
          onClick={() => void run(api.exportDiagnostics)}
        >
          Export diagnostics
        </Button>
      </div>
    </section>
  );
}
