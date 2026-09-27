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
import clsx from 'clsx';
import { api, native, useRecording, useSession } from '../lib/api';
import { parseVocabulary, settingsSchema, type Bootstrap, type Settings } from '../lib/types';
import { Button, IconButton, Shortcut, Toggle } from '../components/ui';
import { Waveform } from '../components/waveform';
import { ui } from '../design-system/classes';

export function SettingsPage({ boot, active }: { boot: Bootstrap; active: boolean }) {
  return (
    <>
      <div className={ui.pageHeading}>
        <div>
          <h1>Settings</h1>
          <p>Audio, transcription, and desktop integration.</p>
        </div>
        <span className={ui.localBadge}>
          <ShieldCheck size={14} /> On this device
        </span>
      </div>
      <div className={ui.settingsLayout}>
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
    <section className={ui.settingsSection}>
      <div className={ui.sectionTitle}>
        <h2>{cleanup ? 'Text cleanup' : 'Deepgram connection'}</h2>
        <p>
          {cleanup
            ? 'DeepSeek V4.1 Flash removes fillers and tidies punctuation after transcription.'
            : 'Audio streams directly from this device to Deepgram.'}
        </p>
      </div>
      {hasKey && !editing ? (
        <div className={ui.keyConnected}>
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
          className={ui.keyForm}
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(key.trim());
          }}
        >
          <label htmlFor={inputId}>{name} API key</label>
          <div className={ui.keyInputRow}>
            <div className={ui.secretInput}>
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
          <p className={ui.fieldHint}>
            <LockKeyhole size={12} /> Saved to GNOME Keyring, never to your settings file.
          </p>
        </form>
      )}
      {keyError && (
        <p className={ui.inlineError} role="alert">
          {keyError}
        </p>
      )}
      {cleanup ? (
        <p className={ui.sectionFootnote}>
          Only the finished transcript is sent to DeepSeek. You can view and copy the original
          transcript. If cleanup fails, Flow uses the original.
        </p>
      ) : (
        <p className={ui.sectionFootnote}>
          Use a key with transcription permission and available account credit.{' '}
          <button
            className={ui.textLink}
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
      <section className={ui.settingsSection}>
        <div className={ui.sectionTitle}>
          <h2>Voice & language</h2>
          <p>Choose your input device and transcription language.</p>
        </div>
        <div className={ui.settingRow}>
          <div>
            <label htmlFor="microphone">Microphone</label>
            <p>Choose the input you use for dictation.</p>
          </div>
          <div className={ui.selectWithAction}>
            <span className={ui.selectWrap}>
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
        {microphones.isError && <p className={ui.inlineError}>{String(microphones.error)}</p>}
        <div className={ui.microphoneTest}>
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
            className={session.phase === 'error' ? ui.inlineError : ui.fieldHint}
            role={session.phase === 'error' ? 'alert' : 'status'}
          >
            {session.message}
          </p>
        )}
        <div className={ui.settingRow}>
          <div>
            <label htmlFor="language">Language</label>
            <p>Use multilingual for supported mixed-language speech.</p>
          </div>
          <span className={ui.selectWrap}>
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
      <section className={ui.settingsSection}>
        <div className={ui.sectionTitle}>
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
      <section className={ui.settingsSection}>
        <div className={ui.sectionTitle}>
          <h2>Personal vocabulary</h2>
          <p>Help Deepgram recognize names, projects, and technical terms.</p>
        </div>
        <label className="sr-only" htmlFor="vocabulary">
          Personal vocabulary
        </label>
        <textarea
          id="vocabulary"
          className={ui.vocabularyInput}
          rows={4}
          placeholder={'One word or phrase per line\nFor example: Cloudflare Workers'}
          value={vocabulary}
          onChange={(e) => setVocabulary(e.target.value)}
          disabled={active}
        />
        <div className={ui.vocabularyFooter}>
          <span>Recognition hints, not automatic replacements.</span>
          <span>{value.vocabulary.length} / 100 terms</span>
        </div>
      </section>
      <div className={ui.savePreferences}>
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
    <section className={clsx(ui.settingsSection, 'border-b-0')}>
      <div className={ui.sectionTitle}>
        <div className="flex items-center justify-between gap-4">
          <h2>Ubuntu desktop setup</h2>
          <Button variant="ghost" onClick={() => void checks.refetch()} loading={checks.isFetching}>
            <RefreshCw size={14} /> Check again
          </Button>
        </div>
        <p>Check the services used for shortcuts and text insertion.</p>
      </div>
      <div className={clsx(ui.settingRow, ui.shortcutSetup)}>
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
      <div className={ui.diagnosticList}>
        {checks.isPending ? (
          <p>
            <LoaderCircle size={16} className="animate-spin" /> Checking your desktop…
          </p>
        ) : checks.isError ? (
          <p className={ui.inlineError}>{String(checks.error)}</p>
        ) : (
          checks.data?.map((check) => (
            <div className={ui.diagnosticRow} key={check.name}>
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
        className={ui.setupDisclosure}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        Shortcut & paste setup{' '}
        <ChevronDown size={16} style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
      </button>
      {expanded && (
        <div className={ui.setupInstructions}>
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
