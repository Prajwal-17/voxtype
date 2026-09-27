import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
  TriangleAlert,
  ArrowUpRight,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, native, useRecording, useSession } from '../lib/api';
import { parseVocabulary, settingsSchema, type Bootstrap, type Settings } from '../lib/types';
import { Button, IconButton, Shortcut, Toggle } from '../components/ui';
import { Waveform } from '../components/waveform';

export function SettingsPage({ boot, active }: { boot: Bootstrap; active: boolean }) {
  return (
    <>
      <div className="mb-7 flex items-center justify-between gap-5 [&_h1]:text-heading [&_h1]:font-semibold [&_h1]:tracking-[-.035em] [&_h1]:text-balance [&_p]:mt-2 [&_p]:text-ui [&_p]:text-muted max-[700px]:flex-wrap max-[700px]:items-start max-[700px]:gap-3 max-[700px]:[&_h1]:text-[26px]">
        <div>
          <h1>Settings</h1>
          <p>Audio, transcription, and desktop integration.</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-caption text-muted max-[1050px]:hidden">
          <ShieldCheck size={14} /> On this device
        </span>
      </div>
      <div className="max-w-4xl">
        <ApiKey boot={boot} active={active} />
        <ApiKey boot={boot} active={active} provider="deepseek" />
        <Preferences key={JSON.stringify(boot.settings)} settings={boot.settings} active={active} />
        <DesktopSetup registered={boot.shortcutRegistered} active={active} />
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
    <section className="mb-7 border-b border-line pb-7">
      <div className="mb-5 [&_h2]:text-title [&_h2]:font-semibold [&_h2]:tracking-[-.02em] [&_p]:mt-1 [&_p]:text-ui [&_p]:text-muted">
        <h2>{cleanup ? 'Text cleanup' : 'Deepgram connection'}</h2>
        <p>
          {cleanup
            ? 'DeepSeek V4.1 Flash removes fillers and tidies punctuation after transcription.'
            : 'Audio streams directly from this device to Deepgram.'}
        </p>
      </div>
      {hasKey && !editing ? (
        <div className="flex items-center gap-3 rounded-control bg-surface p-4 [&>div]:min-w-0 [&>div]:flex-1 [&_strong]:text-ui [&_strong]:font-medium [&_p]:mt-1 [&_p]:text-caption [&_p]:text-muted max-[1050px]:flex-wrap">
          <span className="text-success">
            <KeyRound size={19} />
          </span>
          <div>
            <strong>API key saved securely</strong>
            <p>
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
          className="[&>label]:mb-2 [&>label]:block [&>label]:text-ui [&>label]:font-medium"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(key.trim());
          }}
        >
          <label htmlFor={inputId}>{name} API key</label>
          <div className="flex items-center gap-2 max-[700px]:flex-wrap">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-line-strong bg-surface py-1 pr-1 pl-3 text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent max-[700px]:basis-full [&_input]:w-full [&_input]:min-w-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:py-1.5 [&_input]:text-ui [&_input]:text-ink [&_input]:outline-none [&_input]:placeholder:text-muted">
              <KeyRound size={16} />
              <input
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
            onClick={() => void api.openDeepgram().catch((error) => toast.error(String(error)))}
          >
            Deepgram console <ArrowUpRight size={12} />
          </button>
        </p>
      )}
    </section>
  );
}

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
      <section className="mb-7 border-b border-line pb-7">
        <div className="mb-5 [&_h2]:text-title [&_h2]:font-semibold [&_h2]:tracking-[-.02em] [&_p]:mt-1 [&_p]:text-ui [&_p]:text-muted">
          <h2>Voice & language</h2>
          <p>Choose your input device and transcription language.</p>
        </div>
        <div className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-b-0 last:pb-0 [&>div:first-child]:min-w-0 [&_label]:text-ui [&_label]:font-medium [&_p]:mt-1 [&_p]:max-w-lg [&_p]:text-ui [&_p]:text-muted max-[1050px]:gap-4 max-[700px]:flex-wrap">
          <div>
            <label htmlFor="microphone">Microphone</label>
            <p>Choose the input you use for dictation.</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 max-[700px]:w-full max-[700px]:max-w-full [&>span]:max-[700px]:flex-1">
            <span className="relative inline-flex max-w-full items-center [&_select]:w-48 [&_select]:max-w-full [&_select]:appearance-none [&_select]:truncate [&_select]:rounded-control [&_select]:border [&_select]:border-line-strong [&_select]:bg-surface [&_select]:py-2 [&_select]:pr-8 [&_select]:pl-3 [&_select]:text-ui [&_select]:text-ink [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:right-3 [&>svg]:text-muted max-[1050px]:[&_select]:w-42 max-[700px]:w-full max-[700px]:[&_select]:w-full">
              <select
                id="microphone"
                value={draft.microphone}
                onChange={(e) => set('microphone', e.target.value)}
                disabled={active}
              >
                <option value="">System default</option>
                {microphones.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                {draft.microphone && !microphones.data?.some((m) => m.id === draft.microphone) && (
                  <option value={draft.microphone}>Saved microphone (not connected)</option>
                )}
              </select>
              <ChevronDown size={14} />
            </span>
            <IconButton
              type="button"
              label="Refresh microphones"
              onClick={() => void microphones.refetch()}
              disabled={microphones.isFetching}
            >
              <RefreshCw size={15} className={microphones.isFetching ? 'animate-spin' : ''} />
            </IconButton>
          </div>
        </div>
        {microphones.isError && (
          <p className="mt-2 text-ui text-danger">{String(microphones.error)}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-control bg-surface px-3 py-2 [&>div:first-child]:mr-auto [&>div:first-child]:flex [&>div:first-child]:items-center [&>div:first-child]:gap-2 [&>div:first-child]:text-caption [&>div:first-child]:text-muted">
          <div>
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
            className={
              session.phase === 'error'
                ? 'mt-2 text-ui text-danger'
                : 'mt-2 flex items-center gap-1.5 text-caption text-muted'
            }
            role={session.phase === 'error' ? 'alert' : 'status'}
          >
            {session.message}
          </p>
        )}
        <div className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-b-0 last:pb-0 [&>div:first-child]:min-w-0 [&_label]:text-ui [&_label]:font-medium [&_p]:mt-1 [&_p]:max-w-lg [&_p]:text-ui [&_p]:text-muted max-[1050px]:gap-4 max-[700px]:flex-wrap">
          <div>
            <label htmlFor="language">Language</label>
            <p>Use multilingual for supported mixed-language speech.</p>
          </div>
          <span className="relative inline-flex max-w-full items-center [&_select]:w-48 [&_select]:max-w-full [&_select]:appearance-none [&_select]:truncate [&_select]:rounded-control [&_select]:border [&_select]:border-line-strong [&_select]:bg-surface [&_select]:py-2 [&_select]:pr-8 [&_select]:pl-3 [&_select]:text-ui [&_select]:text-ink [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:right-3 [&>svg]:text-muted max-[1050px]:[&_select]:w-42 max-[700px]:w-full max-[700px]:[&_select]:w-full">
            <select
              id="language"
              value={draft.language}
              onChange={(e) => set('language', e.target.value as Settings['language'])}
              disabled={active}
            >
              {[
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
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </span>
        </div>
      </section>
      <section className="mb-7 border-b border-line pb-7">
        <div className="mb-5 [&_h2]:text-title [&_h2]:font-semibold [&_h2]:tracking-[-.02em] [&_p]:mt-1 [&_p]:text-ui [&_p]:text-muted">
          <h2>Recording preferences</h2>
          <p>Control text insertion and local storage.</p>
        </div>
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
          description="Send the finished transcript to DeepSeek before pasting. Add your DeepSeek key above first."
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
      <section className="mb-7 border-b border-line pb-7">
        <div className="mb-5 [&_h2]:text-title [&_h2]:font-semibold [&_h2]:tracking-[-.02em] [&_p]:mt-1 [&_p]:text-ui [&_p]:text-muted">
          <h2>Personal vocabulary</h2>
          <p>Help Deepgram recognize names, projects, and technical terms.</p>
        </div>
        <label className="sr-only" htmlFor="vocabulary">
          Personal vocabulary
        </label>
        <textarea
          id="vocabulary"
          className="block min-h-[108px] max-h-[260px] w-full resize-y rounded-control border border-line-strong bg-surface px-4 py-3 text-ui placeholder:text-muted"
          rows={4}
          placeholder={'One word or phrase per line\nFor example: Cloudflare Workers'}
          value={vocabulary}
          onChange={(e) => setVocabulary(e.target.value)}
          disabled={active}
        />
        <div className="mt-2 flex justify-between gap-3 text-caption text-muted max-[700px]:flex-col max-[700px]:gap-1">
          <span>Recognition hints, not automatic replacements.</span>
          <span>{value.vocabulary.length} / 100 terms</span>
        </div>
      </section>
      <div className="sticky bottom-0 z-10 mb-7 flex items-center justify-between gap-3 border-t border-line bg-canvas py-4 text-caption text-muted max-[700px]:items-start max-[700px]:[&>span]:max-w-[45%]">
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
    <section className="mb-7 border-b-0 border-line pb-7">
      <div className="mb-5 [&_h2]:text-title [&_h2]:font-semibold [&_h2]:tracking-[-.02em] [&_p]:mt-1 [&_p]:text-ui [&_p]:text-muted">
        <div className="flex items-center justify-between gap-4">
          <h2>Ubuntu desktop setup</h2>
          <Button variant="ghost" onClick={() => void checks.refetch()} loading={checks.isFetching}>
            <RefreshCw size={14} /> Check again
          </Button>
        </div>
        <p>Check the services used for shortcuts and text insertion.</p>
      </div>
      <div className="mb-5 flex items-center justify-between gap-6 rounded-control border-0 bg-surface p-4 [&>div:first-child]:min-w-0 [&_[data-shortcut]]:mt-2 [&_label]:text-ui [&_label]:font-medium [&_p]:mt-1 [&_p]:max-w-lg [&_p]:text-ui [&_p]:text-muted max-[1050px]:gap-4 max-[700px]:flex-wrap">
        <div>
          <label>Recording shortcut</label>
          <p>
            {registered
              ? 'Press once to record. Press again to finish.'
              : 'Enable Right Alt to start and stop dictation from any app.'}
          </p>
          <Shortcut />
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
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 max-[700px]:grid-cols-1">
        {checks.isPending ? (
          <p>
            <LoaderCircle size={16} className="animate-spin" /> Checking your desktop…
          </p>
        ) : checks.isError ? (
          <p className="mt-2 text-ui text-danger">{String(checks.error)}</p>
        ) : (
          checks.data?.map((check) => (
            <div
              className="flex items-start gap-2 [&>svg]:mt-0.5 [&_strong]:text-ui [&_strong]:font-medium [&_p]:mt-1 [&_p]:text-caption [&_p]:text-muted"
              key={check.name}
            >
              {check.status === 'ok' ? (
                <Check className="text-success" size={16} />
              ) : (
                <TriangleAlert className="text-warning" size={16} />
              )}
              <div>
                <strong>{check.name}</strong>
                <p>{check.detail}</p>
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
        <ChevronDown size={16} style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
      </button>
      {expanded && (
        <div className="pt-4 [&_p]:mb-3 [&_p]:text-ui [&_p]:text-muted">
          <p>
            Right Alt toggles recording. Use the cancel button in the voice overlay to discard a
            recording. Keep your cursor in the destination field while recording.
          </p>
          <p>
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
