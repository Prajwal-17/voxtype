import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  WaveformIcon,
  FileTextIcon,
  SlidersHorizontalIcon,
  MicrophoneIcon,
  StopIcon,
  CopyIcon,
} from 'phosphor-react-native';
import { nativeTheme as theme } from '@voxtype/shared';
import { emptyAnalytics, money, type Analytics } from '@voxtype/shared/analytics';
import { Action, Card, Loader, Setting, Text } from '../components/primitives';
import { currentUser, getAnalytics, signIn, signOut, type User } from '../lib/mobile-api';
import Native, {
  isVoxTypeNativeAvailable,
} from '../../modules/voxtype-native/src/VoxTypeNativeModule';
import type { Dictation, Snapshot } from '../../modules/voxtype-native/src/VoxTypeNative.types';
import { styles as ui } from '../components/styles';
// Metro resolves static bundled assets through require.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const logo = require('../../assets/icon.png');
const c = theme.colors;
const preview = Platform.OS === 'web';
const previewSnapshot: Snapshot = {
  accessibilityEnabled: false,
  microphoneGranted: false,
  bubbleEnabled: false,
  cleanupEnabled: false,
  audioLimit: 10,
  status: 'idle',
  inApp: { status: 'idle', text: '', error: '', durationMs: 0 },
};
const tabs = [
  { id: 'home', label: 'Home', icon: WaveformIcon },
  { id: 'transcripts', label: 'Transcripts', icon: FileTextIcon },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontalIcon },
] as const;
type Tab = (typeof tabs)[number]['id'];
const seconds = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
export default function Home() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('home');
  const [user, setUser] = useState<User | null>(
    preview ? { id: 'preview', name: 'Preview', email: '', image: null } : null,
  );
  const [snapshot, setSnapshot] = useState<Snapshot | null>(preview ? previewSnapshot : null);
  const [analytics, setAnalytics] = useState<Analytics | null>(preview ? emptyAnalytics : null);
  const [analyticsError, setAnalyticsError] = useState(false);
  const [loading, setLoading] = useState(isVoxTypeNativeAvailable());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [items, setItems] = useState<Dictation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [paging, setPaging] = useState(false);
  const [pageError, setPageError] = useState(false);
  const requestGeneration = useRef(0);
  const pageBusy = useRef(false);
  const available = isVoxTypeNativeAvailable();
  const refresh = useCallback(async () => {
    if (!available) return;
    const generation = requestGeneration.current;
    const next = await Native.getSnapshot();
    if (generation === requestGeneration.current) setSnapshot(next);
  }, [available]);
  const loadAnalytics = useCallback(async () => {
    if (!available) return;
    const generation = requestGeneration.current;
    try {
      const data = await getAnalytics();
      if (generation === requestGeneration.current) {
        setAnalytics(data);
        setAnalyticsError(false);
      }
    } catch {
      if (generation === requestGeneration.current) setAnalyticsError(true);
    }
  }, [available]);
  const loadPage = useCallback(
    async (next: string | null = null) => {
      if (!available || pageBusy.current) return;
      pageBusy.current = true;
      setPaging(true);
      setPageError(false);
      const generation = requestGeneration.current;
      try {
        const page = await Native.getTranscripts(next);
        if (generation !== requestGeneration.current) return;
        setItems((old) =>
          next
            ? [
                ...old,
                ...page.items.filter((item) => !old.some((previous) => previous.id === item.id)),
              ]
            : page.items,
        );
        setCursor(page.nextCursor);
      } catch {
        if (generation === requestGeneration.current) setPageError(true);
      } finally {
        pageBusy.current = false;
        setPaging(false);
      }
    },
    [available],
  );
  useEffect(() => {
    if (!available) return;
    let alive = true;
    void currentUser()
      .then(async (account) => {
        if (!alive) return;
        setUser(account);
        if (account) await Promise.all([refresh(), loadAnalytics(), loadPage()]);
      })
      .catch(() => {
        if (alive) setMessage('Couldn’t sign in. Try again.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    const subscription = Native.addListener('onChange', () => {
      void refresh();
      void loadAnalytics();
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void currentUser()
          .then((account) => {
            if (alive) setUser(account);
          })
          .catch(() => {});
        void refresh();
        void loadAnalytics();
      }
    });
    return () => {
      alive = false;
      subscription.remove();
      appState.remove();
    };
  }, [available, refresh, loadAnalytics, loadPage]);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await task();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };
  const microphone = async () => {
    const permission = await requestRecordingPermissionsAsync();
    await refresh();
    if (!permission.granted) {
      if (!permission.canAskAgain) await Linking.openSettings();
      return false;
    }
    return true;
  };
  const record = () =>
    void run(async () => {
      if (await microphone()) {
        await Native.startRecording();
        await refresh();
      }
    });
  const inApp = snapshot?.inApp;
  const recording = inApp?.status === 'listening';
  const processing = inApp?.status === 'processing';
  const changeTab = (next: Tab) => {
    setTab(next);
    setMessage('');
    if (next === 'transcripts') void loadPage();
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={s.brand}>
        <Image
          source={logo as import('react-native').ImageSourcePropType}
          style={{ width: 28, height: 28, borderRadius: 8 }}
          accessibilityLabel="VoxType"
        />
        <Text style={{ fontSize: 18, fontWeight: '600' }}>VoxType</Text>
        {preview && <Text style={[ui.muted, { marginLeft: 'auto' }]}>Preview</Text>}
      </View>
      {message ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          onPress={() => setMessage('')}
          style={s.message}
        >
          <Text accessibilityLiveRegion="polite" style={{ color: c.danger }}>
            {message}
          </Text>
        </Pressable>
      ) : null}
      {loading ? (
        <Loader />
      ) : !user ? (
        <View style={{ padding: 24, gap: 24, flex: 1, justifyContent: 'center' }}>
          <Text style={ui.heading}>Sign in</Text>
          <Action
            label={busy ? 'Signing in' : 'Continue with Google'}
            disabled={busy || !available}
            onPress={() =>
              void run(async () => {
                setUser(await signIn());
                await Promise.all([refresh(), loadAnalytics(), loadPage()]);
              })
            }
          />
          {!available && <Text style={ui.muted}>Open the installed Android app to sign in.</Text>}
        </View>
      ) : (
        <>
          {tab === 'transcripts' ? (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              contentContainerStyle={s.content}
              ListHeaderComponent={
                <Text style={[ui.heading, { marginBottom: 24 }]}>Transcripts</Text>
              }
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              renderItem={({ item }) => (
                <Transcript
                  item={item}
                  onCopy={() =>
                    void Clipboard.setStringAsync(item.text).then(() => setMessage('Copied'))
                  }
                />
              )}
              ListEmptyComponent={
                paging ? (
                  <Loader />
                ) : (
                  <Text style={ui.muted}>
                    {pageError ? 'Couldn’t load transcripts' : 'No transcripts yet'}
                  </Text>
                )
              }
              ListFooterComponent={
                paging ? (
                  <Loader />
                ) : cursor || pageError ? (
                  <Action
                    label={pageError ? 'Retry' : 'Load more'}
                    secondary
                    onPress={() => void loadPage(cursor)}
                  />
                ) : null
              }
            />
          ) : (
            <ScrollView contentContainerStyle={s.content}>
              <Text style={[ui.heading, { marginBottom: 24 }]}>
                {tab === 'home' ? 'Home' : 'Settings'}
              </Text>
              {tab === 'home' ? (
                <>
                  <Text style={[ui.muted, { marginBottom: 12 }]}>Last 30 days</Text>
                  {analyticsError ? (
                    <Action
                      label="Retry analytics"
                      secondary
                      onPress={() => void loadAnalytics()}
                    />
                  ) : !analytics ? (
                    <Loader />
                  ) : (
                    <>
                      <View style={s.stats}>
                        {[
                          ['Words', analytics.summary.totalWords.toLocaleString()],
                          ['Minutes', (analytics.summary.totalDurationMs / 60000).toFixed(1)],
                          ['Avg. recording', seconds(analytics.summary.averageDurationMs)],
                          ['Transcripts', analytics.summary.dictations.toLocaleString()],
                        ].map(([label, value]) => (
                          <Card key={label} style={s.stat}>
                            <Text style={ui.muted}>{label}</Text>
                            <Text style={s.value}>{value}</Text>
                          </Card>
                        ))}
                      </View>
                      <Text style={[ui.muted, { marginTop: 16 }]}>
                        {analytics.summary.averageWordsPerMinute} words / min
                      </Text>
                      <Text style={[ui.muted, { marginTop: 8 }]}>
                        Estimated cost · Deepgram {money(analytics.costs.deepgramMin)}–
                        {money(analytics.costs.deepgramMax)} · DeepSeek{' '}
                        {money(analytics.costs.deepseek)}
                        {analytics.costs.unmeteredRequests ? ' (partial)' : ''}
                      </Text>
                    </>
                  )}
                  <Card style={{ marginTop: 28, gap: 16 }}>
                    <View style={s.row}>
                      <Text style={ui.title}>Quick recording</Text>
                      {recording && (
                        <Text accessibilityLiveRegion="polite" style={ui.muted}>
                          Recording
                        </Text>
                      )}
                    </View>
                    {processing ? (
                      <Loader label="Processing" />
                    ) : (
                      <Action
                        label={recording ? 'Stop' : 'Record'}
                        disabled={
                          busy ||
                          preview ||
                          (!recording &&
                            ['listening', 'processing', 'connecting'].includes(
                              snapshot?.status ?? '',
                            ))
                        }
                        onPress={
                          recording
                            ? () =>
                                void run(async () => {
                                  await Native.stopRecording();
                                  await refresh();
                                })
                            : record
                        }
                        icon={
                          recording ? (
                            <StopIcon size={20} color={c.onPrimary} />
                          ) : (
                            <MicrophoneIcon size={20} color={c.onPrimary} weight="duotone" />
                          )
                        }
                      />
                    )}
                    {(recording || processing) && (
                      <Action
                        label="Cancel"
                        secondary
                        onPress={() =>
                          void run(async () => {
                            await Native.cancelRecording();
                            await refresh();
                          })
                        }
                      />
                    )}
                    {inApp?.text ? (
                      <>
                        <Text selectable>{inApp.text}</Text>
                        <Action
                          label="Copy text"
                          secondary
                          icon={<CopyIcon size={18} color={c.primary} />}
                          onPress={() =>
                            void Clipboard.setStringAsync(inApp.text).then(() =>
                              setMessage('Copied'),
                            )
                          }
                        />
                      </>
                    ) : null}
                    {inApp?.error ? (
                      <Text accessibilityLiveRegion="polite" style={{ color: c.danger }}>
                        {inApp.error}
                      </Text>
                    ) : null}
                  </Card>
                </>
              ) : (
                <>
                  <Card>
                    <Setting
                      label="Voice bubble"
                      value={!!snapshot?.bubbleEnabled}
                      disabled={preview || busy}
                      onChange={(value) =>
                        void run(async () => {
                          await Native.setBubbleEnabled(value);
                          await refresh();
                        })
                      }
                    />
                    {snapshot?.bubbleEnabled && (
                      <>
                        <Text style={[ui.muted, { marginBottom: 12 }]}>
                          Appears beside an active text field.
                        </Text>
                        <PermissionRow
                          label="Accessibility"
                          granted={snapshot.accessibilityEnabled}
                          disabled={busy || preview}
                          onPress={() =>
                            void run(async () => {
                              await Native.openAccessibilitySettings();
                            })
                          }
                        />
                        <PermissionRow
                          label="Microphone"
                          granted={snapshot.microphoneGranted}
                          disabled={busy || preview}
                          onPress={() =>
                            void run(async () => {
                              await microphone();
                            })
                          }
                        />
                      </>
                    )}
                    <Setting
                      label="Clean up wording"
                      value={!!snapshot?.cleanupEnabled}
                      disabled={preview || busy || recording || processing}
                      onChange={(value) =>
                        void run(async () => {
                          await Native.setCleanupEnabled(value);
                          await refresh();
                        })
                      }
                    />
                  </Card>
                  <Card style={{ marginTop: 20, gap: 16 }}>
                    {user.email ? <Text style={ui.muted}>{user.email}</Text> : null}
                    <Action
                      label="Sign out"
                      secondary
                      disabled={preview || busy}
                      onPress={() =>
                        void run(async () => {
                          requestGeneration.current++;
                          await signOut();
                          setUser(null);
                          setSnapshot(null);
                          setAnalytics(null);
                          setItems([]);
                          setCursor(null);
                        })
                      }
                    />
                  </Card>
                </>
              )}
            </ScrollView>
          )}
          <View style={[s.tabs, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            {tabs.map(({ id, label, icon: Icon }) => (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: tab === id }}
                onPress={() => changeTab(id)}
                style={s.tab}
              >
                <Icon
                  size={24}
                  weight={tab === id ? 'fill' : 'regular'}
                  color={tab === id ? c.primary : c.textMuted}
                />
                <Text
                  style={{
                    fontSize: 11,
                    lineHeight: 16,
                    fontWeight: tab === id ? '600' : '400',
                    color: tab === id ? c.primary : c.textMuted,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
function Transcript({ item, onCopy }: { item: Dictation; onCopy: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse transcript' : 'Expand transcript'}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
      >
        <Text numberOfLines={expanded ? undefined : 3}>{item.text || 'Empty transcript'}</Text>
      </Pressable>
      <View style={[s.row, { marginTop: 12 }]}>
        <Text style={ui.muted}>
          {new Date(item.createdAt).toLocaleDateString()} · {item.wordCount} words
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy transcript"
          onPress={onCopy}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <CopyIcon size={20} color={c.primary} />
        </Pressable>
      </View>
    </Card>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  brand: { height: 64, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 10 },
  content: { padding: 24, paddingTop: 18, paddingBottom: 36 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexBasis: '46%', flexGrow: 1, padding: 18 },
  value: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '500',
    marginTop: 14,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.7,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  tabs: {
    flexDirection: 'row',
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4 },
  message: {
    padding: 14,
    marginHorizontal: 24,
    borderRadius: 14,
    backgroundColor: c.dangerContainer,
  },
});

function PermissionRow({
  label,
  granted,
  disabled,
  onPress,
}: {
  label: string;
  granted: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <View style={s.row}>
      <Text>{label}</Text>
      <Action
        label={granted ? 'Enabled' : 'Allow'}
        secondary
        disabled={granted || disabled}
        onPress={onPress}
      />
    </View>
  );
}
