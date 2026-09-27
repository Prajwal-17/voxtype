import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mic,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, native, useRecording, useSession } from '../lib/api';
import { cn } from '../lib/utils';
import { parseVocabulary, settingsSchema, type Bootstrap, type Settings } from '../lib/types';
import { Button, IconButton, Shortcut, Toggle } from '../components/ui';
import { FieldRow, PageHeader, SectionHeader } from '../components/layout';
import { Input } from '../components/ui/input';
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
      <PageHeader
        title="Settings"
        description="Audio, transcription, and desktop integration."
        actions={
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-caption font-medium text-success max-lg:hidden">
            <ShieldCheck size={14} /> Stored on this device
          </span>
        }
      />
      <div className="max-w-5xl">
        <ApiKey boot={boot} active={active} />
        <Preferences key={JSON.stringify(boot.settings)} settings={boot.settings} active={active} />
        <DesktopSetup registered={boot.shortcutRegistered} active={active} />
        <ApiKey boot={boot} active={active} provider="deepseek" />
      </div>
    </>
  );
}

function ApiKey({
  boot,
  active,
  provider = 'deepgram',
}: {
  boot: Bootstrap;
  active: boolean;
  provider?: 'deepgram' | 'deepseek';
}) {
  const cleanup = provider === 'deepseek';
  const name = cleanup ? 'DeepSeek' : 'Deepgram';
  const hasKey = cleanup ? boot.hasCleanupKey : boot.hasKey;
  const keyError = cleanup ? boot.cleanupKeyError : boot.keyError;
  const inputId = `${provider}-api-key`;
  const [key, setKey] = useState('');
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: cleanup ? api.saveCleanupKey : api.saveKey,
    gcTime: 0,
    onSuccess: () => {
      setKey('');
      setEditing(false);
      setVisible(false);
      save.reset();
      void client.invalidateQueries({ queryKey: ['bootstrap'] });
      toast.success('API key saved to your desktop keyring');
    },
  });
  const remove = useMutation({
    mutationFn: cleanup ? api.removeCleanupKey : api.removeKey,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['bootstrap'] });
      toast.success('API key removed');
    },
  });
  return (
    <section className="mb-5 rounded-panel border border-line bg-surface p-5 max-md:p-4">
      <SectionHeader
        title={cleanup ? 'Text cleanup' : 'Deepgram connection'}
        description={
          cleanup
            ? 'DeepSeek V4.1 Flash removes fillers and tidies punctuation after transcription.'
            : 'Audio streams directly from this device to Deepgram.'
        }
      />
      {hasKey && !editing ? (
        <div className="flex items-center gap-3 rounded-control bg-subtle p-4 max-lg:flex-wrap">
          <span className="text-success">
            <KeyRound size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <strong className="text-ui font-medium">API key saved securely</strong>
            <p className="mt-1 text-caption text-muted">
              {cleanup
                ? 'Saved in your desktop keyring. Enable Clean up dictation below to use it.'
                : 'Stored in your desktop keyring. Ready to try a dictation.'}
            </p>
          </div>
          <Button onClick={() => setEditing(true)} disabled={active}>
            Replace key
          </Button>
          <IconButton
            label="Remove API key"
            disabled={active || remove.isPending}
            onClick={() => remove.mutate()}
          >
            <Trash2 size={17} />
          </IconButton>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(key.trim());
          }}
        >
          <Label htmlFor={inputId} className="mb-2 block">
            {name} API key
          </Label>
          <div className="flex items-center gap-2 max-md:flex-wrap">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-line-strong bg-raised py-1 pr-1 pl-3 text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent max-md:basis-full">
              <KeyRound size={16} className="shrink-0" />
              <Input
                id={inputId}
                type={visible ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={`Paste your ${name} API key`}
                disabled={active}
              />
              <IconButton
                type="button"
                label={visible ? 'Hide API key' : 'Show API key'}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </IconButton>
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={active || !native || key.trim().length < 10}
              loading={save.isPending}
            >
              Save key
            </Button>
            {editing && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setKey('');
                }}
              >
                Cancel
              </Button>
            )}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-caption text-muted">
            <LockKeyhole size={12} /> Saved to GNOME Keyring, never to your settings file.
          </p>
        </form>
      )}
      {keyError && (
        <p className="mt-2 text-ui text-danger" role="alert">
          {keyError}
        </p>
      )}
      {cleanup ? (
        <p className="mt-4 text-caption text-muted">
          Only the finished transcript is sent to DeepSeek. You can view and copy the original
          transcript. If cleanup fails, Flow uses the original.
        </p>
      ) : (
        <p className="mt-4 text-caption text-muted">
          Use a key with transcription permission and available account credit.{' '}
          <button
            className="inline-flex items-center gap-1 border-0 bg-transparent p-0 text-caption text-accent hover:text-accent-hover hover:underline hover:underline-offset-[3px]"
            type="button"
            onClick={() =>
              void api
                .openDeepgram()
                .catch(() => toast.error('Couldn’t open the Deepgram console. Try again.'))
            }
          >
            Deepgram console <ArrowUpRight size={12} />
          </button>
        </p>
      )}
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
            Flow couldn’t list microphones. Check that one is connected, then refresh.
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
          description="Send the finished transcript to DeepSeek before pasting. Connect the optional cleanup service below."
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

function DesktopSetup({ registered, active }: { registered: boolean; active: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const client = useQueryClient();
  const enable = useMutation({
    mutationFn: api.enableShortcut,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['bootstrap'] });
      void client.invalidateQueries({ queryKey: ['diagnostics'] });
      toast.success('Recording shortcut enabled');
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
            {registered
              ? 'Press once to record. Press again to finish.'
              : 'Enable the key below to start and stop dictation from any app.'}
          </p>
          <span className="mt-2 block">
            <Shortcut />
          </span>
        </div>
        <Button
          onClick={() => enable.mutate()}
          variant={registered ? 'secondary' : 'primary'}
          disabled={!native || active}
          loading={enable.isPending}
        >
          {registered ? 'Reapply shortcut' : 'Enable shortcut'}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 max-md:grid-cols-1">
        {checks.isPending ? (
          <p className="flex items-center gap-2 text-ui text-muted">
            <LoaderCircle size={16} className="animate-spin" /> Checking your desktop…
          </p>
        ) : checks.isError ? (
          <p className="mt-2 text-ui text-danger">
            Flow couldn’t check desktop services. Nothing was changed. Select Check again.
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
            <Shortcut /> toggles recording. Use the cancel button in the voice overlay to discard a
            recording. Keep your cursor in the destination field while recording.
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
