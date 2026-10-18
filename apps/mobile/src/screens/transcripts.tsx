import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { CopyIcon } from 'phosphor-react-native/src/icons/Copy';
import { DotsThreeIcon } from 'phosphor-react-native/src/icons/DotsThree';
import { MagnifyingGlassIcon } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { PlayIcon } from 'phosphor-react-native/src/icons/Play';
import { XIcon } from 'phosphor-react-native/src/icons/X';
import { nativeTheme as theme } from '@voxtype/shared';
import { RecordingPlayer } from '../components/recording-player';
import { audioTime } from '../lib/audio-time';
import { Screen } from '../components/screen';
import { Sheet } from '../components/sheet';
import { Action, IconButton, Loader, SettingLink, Text } from '../components/primitives';
import { styles as ui } from '../components/styles';
import { useAppState, useTranscripts } from '../state/app-state';
import Native from '../../modules/voxtype-native/src/VoxTypeNativeModule';
import type {
  Dictation,
  LocalRecording,
} from '../../modules/voxtype-native/src/VoxTypeNative.types';
const c = theme.colors;
type Entry = {
  id: string;
  text: string;
  createdAt: number;
  durationMs: number;
  wordCount: number;
  local?: LocalRecording;
  transcript?: Dictation;
};
function entry(item: Dictation, local?: LocalRecording): Entry {
  return { ...item, local, transcript: item };
}
function dateLabel(time: number) {
  return new Date(time).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(new Date(time).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}
export default function TranscriptsScreen() {
  const app = useAppState();
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState<'all' | 'device'>('all');
  const query = useTranscripts(search);
  const [local, setLocal] = useState<LocalRecording[]>([]),
    [localError, setLocalError] = useState(false),
    [localLoading, setLocalLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Entry | null>(null),
    [autoPlay, setAutoPlay] = useState(false),
    [menu, setMenu] = useState<Entry | null>(null);
  const [confirmation, setConfirmation] = useState<{
      action: 'delete' | 'regenerate';
      item: Entry;
    } | null>(null),
    [actionError, setActionError] = useState('');
  const userId = app.user?.id;
  const active =
    ['listening', 'processing'].includes(app.snapshot?.inApp.status ?? '') ||
    ['listening', 'connecting', 'processing'].includes(app.snapshot?.status ?? '');
  useEffect(() => {
    let disposed = false;
    const request = app.available && userId ? Native.getLocalRecordings() : Promise.resolve([]);
    void request
      .then((rows) => {
        if (!disposed) {
          setLocal(rows);
          setLocalError(false);
        }
      })
      .catch(() => {
        if (!disposed) setLocalError(true);
      })
      .finally(() => {
        if (!disposed) setLocalLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [app.available, app.revision, userId, retry]);
  const rows: Entry[] =
    filter === 'all'
      ? query.items.map((item) =>
          entry(
            item,
            local.find((take) => take.id === item.id),
          ),
        )
      : local
          .map((take) => {
            const transcript = query.items.find((item) => item.id === take.id);
            return transcript
              ? entry(transcript, take)
              : {
                  ...take,
                  text: take.originalText,
                  wordCount: take.originalText.trim().split(/\s+/).filter(Boolean).length,
                  local: take,
                };
          })
          .filter((take) =>
            take.text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
          );
  const loading = filter === 'all' ? query.loading : localLoading;
  const error = filter === 'all' ? query.error : localError;
  const refresh = () => {
    setRetry((n) => n + 1);
    void query.refresh();
  };
  const copy = (text: string) =>
    void app.run(async () => {
      await Clipboard.setStringAsync(text);
      app.notify('Copied');
    });
  const open = (item: Entry, play = false) => {
    setAutoPlay(play);
    setSelected(item);
  };
  const ask = (action: 'delete' | 'regenerate', item: Entry) => {
    setMenu(null);
    setActionError('');
    setConfirmation({ action, item });
  };
  const confirm = () =>
    void app.run(async () => {
      if (!confirmation || !userId) return;
      try {
        if (confirmation.action === 'delete') await Native.deleteTranscript(confirmation.item.id);
        else await Native.regenerateTranscript(confirmation.item.id, userId);
        setSelected(null);
        setConfirmation(null);
        refresh();
        app.notify(
          confirmation.action === 'delete' ? 'Transcript deleted' : 'Transcript regenerated',
        );
      } catch {
        setActionError(
          confirmation.action === 'delete'
            ? 'Couldn’t delete. Check your connection and try again.'
            : 'Couldn’t regenerate. Your existing text is unchanged. Try again.',
        );
      }
    });
  const menuContent = (
    <Sheet title="Transcript actions" visible={!!menu} onClose={() => setMenu(null)}>
      <SettingLink
        label="Copy text"
        onPress={() => {
          if (menu) copy(menu.text);
          setMenu(null);
        }}
      />
      {menu?.local && (
        <>
          <SettingLink
            label="Copy original"
            disabled={!menu.local.originalText}
            onPress={() => {
              if (menu.local) copy(menu.local.originalText);
              setMenu(null);
            }}
          />
          <SettingLink
            label="Export audio"
            disabled={!menu.local.audioAvailable || app.busy}
            onPress={() => {
              const id = menu.id;
              setMenu(null);
              void app.run(() => Native.shareRecording(id));
            }}
          />
          <SettingLink
            label="Regenerate transcript"
            disabled={!menu.local.audioAvailable || app.busy || active}
            onPress={() => ask('regenerate', menu)}
          />
        </>
      )}
      {menu?.transcript && (
        <SettingLink
          label="Delete transcript"
          destructive
          disabled={app.busy}
          onPress={() => ask('delete', menu)}
        />
      )}
    </Sheet>
  );
  const confirmationContent = (
    <Sheet
      title={confirmation?.action === 'delete' ? 'Delete transcript?' : 'Regenerate transcript?'}
      visible={!!confirmation}
      onClose={() => {
        if (!app.busy) setConfirmation(null);
      }}
    >
      <Text style={[ui.muted, { marginBottom: 16 }]}>
        {confirmation?.action === 'delete'
          ? 'Removes the text from your account and synced devices. The local recording and original remain until replaced by newer takes.'
          : 'Sends this recording for transcription and replaces the current text. If it fails, your text stays unchanged.'}
      </Text>
      {!!actionError && (
        <Text accessibilityRole="alert" style={{ color: c.danger, marginBottom: 12 }}>
          {actionError}
        </Text>
      )}
      <Action
        label={
          app.busy
            ? 'Please wait…'
            : confirmation?.action === 'delete'
              ? 'Delete transcript'
              : 'Regenerate'
        }
        disabled={app.busy || !app.available}
        onPress={confirm}
      />
      <Action label="Cancel" secondary disabled={app.busy} onPress={() => setConfirmation(null)} />
    </Sheet>
  );
  return (
    <>
      <Screen title="Transcripts" scroll={false}>
        <View style={{ paddingHorizontal: 20, gap: 8, paddingBottom: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 12,
              backgroundColor: c.surfaceSubtle,
              borderRadius: 12,
            }}
          >
            <MagnifyingGlassIcon size={19} color={c.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search transcripts"
              placeholderTextColor={c.textMuted}
              accessibilityLabel="Search transcripts"
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                flex: 1,
                minHeight: 48,
                paddingHorizontal: 10,
                color: c.text,
                fontFamily: 'MonaSansRegular',
                fontSize: 15,
              }}
            />
            {!!search && (
              <IconButton label="Clear search" onPress={() => setSearch('')}>
                <XIcon size={18} color={c.textMuted} />
              </IconButton>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {(['all', 'device'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: filter === value }}
                onPress={() => setFilter(value)}
                style={{
                  minHeight: 48,
                  justifyContent: 'center',
                  borderBottomWidth: 2,
                  borderBottomColor: filter === value ? c.primary : 'transparent',
                  paddingHorizontal: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: filter === value ? '600' : '400',
                    color: filter === value ? c.primary : c.textMuted,
                  }}
                >
                  {value === 'all' ? 'All transcripts' : 'On this device'}
                </Text>
              </Pressable>
            ))}
          </View>
          {filter === 'device' && (
            <Text style={ui.muted}>Latest 10 recordings and originals saved here.</Text>
          )}
          {localError && filter === 'all' && (
            <Action
              label="Retry loading recordings"
              secondary
              onPress={() => setRetry((n) => n + 1)}
            />
          )}
        </View>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          renderItem={({ item, index }) => (
            <View>
              {(index === 0 ||
                new Date(rows[index - 1].createdAt).toDateString() !==
                  new Date(item.createdAt).toDateString()) && (
                <Text style={[ui.muted, { paddingTop: 16, paddingBottom: 4, fontWeight: '500' }]}>
                  {dateLabel(item.createdAt)}
                </Text>
              )}
              <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: c.border }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Read transcript: ${item.text || 'No transcript yet'}`}
                  onPress={() => open(item)}
                  style={{ minHeight: 48, justifyContent: 'center' }}
                >
                  <Text numberOfLines={3} style={{ fontSize: 15, lineHeight: 23 }}>
                    {item.text || 'No transcript yet. Open to recover this recording.'}
                  </Text>
                </Pressable>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[ui.muted, { flex: 1, fontSize: 12 }]}>
                    {new Date(item.createdAt).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}{' '}
                    · {item.wordCount} words · {audioTime(item.durationMs / 1000)}
                  </Text>
                  {item.local?.audioAvailable && (
                    <IconButton
                      label="Play recording"
                      disabled={active}
                      onPress={() => open(item, true)}
                    >
                      <PlayIcon size={19} color={c.primary} weight="fill" />
                    </IconButton>
                  )}
                  <IconButton label="Transcript actions" onPress={() => setMenu(item)}>
                    <DotsThreeIcon size={24} weight="bold" color={c.textMuted} />
                  </IconButton>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            loading ? (
              <Loader label="Loading transcripts" />
            ) : (
              <View style={{ paddingVertical: 40, gap: 8 }}>
                <Text style={ui.title}>
                  {error
                    ? 'Couldn’t load transcripts'
                    : search
                      ? 'No matching transcripts'
                      : filter === 'device'
                        ? 'No recordings on this device'
                        : 'Your words, saved here'}
                </Text>
                <Text style={ui.muted}>
                  {error
                    ? 'Check your connection and try again.'
                    : search
                      ? 'Try a different word or clear your search.'
                      : 'Record your first thought to get started.'}
                </Text>
                <Action
                  label={error ? 'Retry' : search ? 'Clear search' : 'Start recording'}
                  secondary
                  onPress={
                    error
                      ? refresh
                      : search
                        ? () => setSearch('')
                        : () => router.navigate('/(tabs)/home')
                  }
                />
              </View>
            )
          }
          ListFooterComponent={
            rows.length > 0 && filter === 'all' ? (
              <View style={{ paddingVertical: 8 }}>
                {query.error && (
                  <>
                    <Text style={ui.muted}>
                      Couldn’t refresh. Your saved transcripts are still here.
                    </Text>
                    <Action label="Retry" secondary onPress={refresh} />
                  </>
                )}
                {query.cursor && !query.error && (
                  <Action
                    label={query.loading ? 'Loading more…' : 'Load more'}
                    secondary
                    disabled={query.loading || query.refreshing}
                    onPress={() => void query.more()}
                  />
                )}
              </View>
            ) : null
          }
        />
      </Screen>
      {!selected && menuContent}
      {!selected && confirmationContent}
      <Modal
        visible={!!selected}
        animationType="none"
        onRequestClose={() => {
          setMenu(null);
          setConfirmation(null);
          setSelected(null);
        }}
      >
        {selected && (
          <Screen
            title="Transcript"
            scroll={false}
            onBack={() => {
              setMenu(null);
              setConfirmation(null);
              setSelected(null);
            }}
            actions={
              <IconButton label="Transcript actions" onPress={() => setMenu(selected)}>
                <DotsThreeIcon size={24} weight="bold" color={c.text} />
              </IconButton>
            }
          >
            <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 12 }}>
              <Text style={ui.muted}>
                {dateLabel(selected.createdAt)} ·{' '}
                {new Date(selected.createdAt).toLocaleTimeString(undefined, {
                  hour: 'numeric',
                  minute: '2-digit',
                })}{' '}
                · {selected.wordCount} words
              </Text>
              {selected.local?.audioAvailable ? (
                <RecordingPlayer key={selected.id} id={selected.id} autoPlay={autoPlay} />
              ) : (
                <Text style={ui.muted}>Audio isn’t saved on this device.</Text>
              )}
            </View>
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 16 }}
            >
              <Text selectable style={{ fontSize: 17, lineHeight: 28 }}>
                {selected.text ||
                  'No transcript yet. Use the actions menu to regenerate it from your recording.'}
              </Text>
              <Action
                label="Copy text"
                secondary
                icon={<CopyIcon size={18} color={c.primary} />}
                disabled={!selected.text}
                onPress={() => copy(selected.text)}
              />
              {selected.local && !selected.transcript && (
                <Text style={ui.muted}>Original text saved on this device.</Text>
              )}
            </ScrollView>
            {menuContent}
            {confirmationContent}
          </Screen>
        )}
      </Modal>
    </>
  );
}
