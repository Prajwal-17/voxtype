import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  LoaderCircle,
  Mic,
  RefreshCw,
  Square,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, native, useRecording, useSession } from '../lib/api';
import { captureShortcut } from '../lib/shortcuts';
import { cn } from '../lib/utils';
import { parseVocabulary, settingsSchema, type Bootstrap, type Settings } from '../lib/types';
import { Button, IconButton, Shortcut, Toggle } from '../components/ui';
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

export function SettingsPage({ boot, active }: { boot: Bootstrap; active: boolean }) {
  return (
    <>
      <PageHeader title="Settings" description="Audio, transcription, and desktop integration." />
      <div className="max-w-5xl">
        <SpeechConnection />
        <Preferences key={JSON.stringify(boot.settings)} settings={boot.settings} active={active} />
        <DesktopSetup boot={boot} active={active} />
      </div>
    </>
  );
}

function SpeechConnection() {
  return (
    <section className="mb-5 rounded-panel border border-line bg-surface p-5 max-md:p-4">
      <SectionHeader
        title="Transcription connection"
        description="Your VoxType account connects transcription automatically."
      />
      <p className="text-ui text-muted">
        Audio streams directly to Deepgram. Start speaking as soon as recording begins.
      </p>
    </section>
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

function Preferences({ settings, active }: { settings: Settings; active: boolean }) {
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
      <section className="mb-5 rounded-panel border border-line bg-surface p-5 max-md:p-4">
        <SectionHeader
          title="Voice & language"
          description="Choose your input device and transcription language."
        />
        <FieldRow
          label="Microphone"
          htmlFor="microphone"
          description="Choose the input you use for dictation."
        >
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
              <RefreshCw size={15} className={microphones.isFetching ? 'animate-spin' : ''} />
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
            <Mic size={16} />
            <span>
              {session.isTest && active
                ? 'Listening to your microphone…'
                : dirty
                  ? 'Save your microphone selection before testing.'
                  : 'Test the selected microphone.'}
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
            {session.isTest && active ? <Square size={12} /> : null}
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
        <FieldRow
          label="Language"
          htmlFor="language"
          description="Use multilingual for supported mixed-language speech."
        >
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
      <section className="mb-5 rounded-panel border border-line bg-surface p-5 max-md:p-4">
        <SectionHeader
          title="Recording preferences"
          description="Control text insertion and local storage."
        />
        <Toggle
          label="Detect speech locally"
          description="Use on-device voice detection to skip long pauses. A short lead-in and tail protect word boundaries. Turn off if quiet speech is missed."
          checked={draft.voiceDetection}
          onChange={(v) => set('voiceDetection', v)}
          disabled={active}
        />
        <Toggle
          label="Paste when I finish"
          description="For shortcut recordings, send Ctrl+V to the focused app. Otherwise, copy the text."
          checked={draft.autoPaste}
          onChange={(v) => set('autoPaste', v)}
          disabled={active}
        />
        <Toggle
          label="Clean up dictation"
          description="Send the finished transcript through VoxType for DeepSeek cleanup before pasting. If cleanup fails, the original is kept."
          checked={draft.cleanupEnabled}
          onChange={(v) => set('cleanupEnabled', v)}
          disabled={active}
        />
        <Toggle
          label="Keep local history"
          description="Save up to 200 dictations on this device. Existing history stays until you delete it."
          checked={draft.keepHistory}
          onChange={(v) => set('keepHistory', v)}
          disabled={active}
        />
      </section>
      <section className="mb-5 rounded-panel border border-line bg-surface p-5 max-md:p-4">
        <SectionHeader
          title="Personal vocabulary"
          description="Help Deepgram recognize names, projects, and technical terms."
        />
        <Label className="sr-only" htmlFor="vocabulary">
          Personal vocabulary
        </Label>
        <Textarea
          id="vocabulary"
          rows={4}
          placeholder={'One word or phrase per line\nFor example: Cloudflare Workers'}
          value={vocabulary}
          onChange={(e) => setVocabulary(e.target.value)}
          disabled={active}
        />
        <div className="mt-2 flex justify-between gap-3 text-caption text-muted max-md:flex-col max-md:gap-1">
          <span>Recognition hints, not automatic replacements.</span>
          <span>{value.vocabulary.length} / 100 terms</span>
        </div>
      </section>
      <div className="sticky bottom-4 z-10 mb-5 flex items-center justify-between gap-3 rounded-panel border border-line bg-surface px-4 py-3 text-caption text-muted shadow-panel">
        <span>
          {active
            ? 'Finish recording to change preferences.'
            : dirty
              ? 'You have unsaved changes.'
              : 'All preferences saved.'}
        </span>
        <Button
          variant="primary"
          type="submit"
          loading={save.isPending}
          disabled={!dirty || active || !native}
        >
          Save preferences
        </Button>
      </div>
    </form>
  );
}

function DesktopSetup({ boot, active }: { boot: Bootstrap; active: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [shortcutId, setShortcutId] = useState(boot.shortcutId);
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
          <h2 className="text-title font-semibold tracking-[-.02em]">Ubuntu desktop setup</h2>
          <Button variant="ghost" onClick={() => void checks.refetch()} loading={checks.isFetching}>
            <RefreshCw size={14} /> Check again
          </Button>
        </div>
        <p className="mt-1 text-ui text-muted">
          Check the services used for shortcuts and text insertion.
        </p>
      </div>
      <div className="mb-5 flex items-center justify-between gap-6 rounded-control bg-subtle p-4 max-lg:gap-4 max-md:flex-wrap">
        <div className="min-w-0">
          <Label>Recording shortcut</Label>
          <p className="mt-1 max-w-lg text-ui text-muted">
            {boot.shortcutRegistered
              ? 'Press once to record. Press again to finish.'
              : 'Choose a key combination to start and stop dictation from any app.'}
          </p>
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
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 max-md:grid-cols-1">
        {checks.isPending ? (
          <p className="flex items-center gap-2 text-ui text-muted">
            <LoaderCircle size={16} className="animate-spin" /> Checking your desktop…
          </p>
        ) : checks.isError ? (
          <p className="mt-2 text-ui text-danger">
            VoxType couldn’t check desktop services. Nothing was changed. Select Check again.
          </p>
        ) : (
          checks.data?.map((check) => (
            <div className="flex items-start gap-2" key={check.name}>
              {check.status === 'ok' ? (
                <Check className="mt-0.5 text-success" size={16} />
              ) : (
                <TriangleAlert className="mt-0.5 text-warning" size={16} />
              )}
              <div>
                <strong className="text-ui font-medium">{check.name}</strong>
                <p className="mt-1 text-caption text-muted">{check.detail}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <button
        className="mt-6 flex w-full items-center justify-between border-0 border-t border-line bg-transparent pt-5 text-ui font-medium"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        Shortcut & paste setup{' '}
        <ChevronDown
          size={16}
          className="transition-transform duration-150"
          style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
        />
      </button>
      {expanded && (
        <div className="pt-4">
          <p className="mb-3 text-ui text-muted">
            <Shortcut label={boot.shortcutLabel} /> toggles recording. Use the cancel button in the
            voice overlay to discard a recording. Keep your cursor in the destination field while
            recording.
          </p>
          <p className="mb-3 text-ui text-muted">
            Wayland paste needs <code className="text-caption text-accent-ink">ydotoold</code>{' '}
            running with access to <code className="text-caption text-accent-ink">/dev/uinput</code>
            . The app checks the service; it does not change system permissions. The README includes
            installation steps.
          </p>
        </div>
      )}
    </section>
  );
}
