import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  View,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nativeTheme as theme } from '@voxtype/design-system/native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import VoxTypeNative, {
  isVoxTypeNativeAvailable,
} from '../../modules/voxtype-native/src/VoxTypeNativeModule';
import type { Dictation, Snapshot } from '../../modules/voxtype-native/src/VoxTypeNative.types';
import { currentUser, signIn, signOut, type User } from '@/lib/mobile-api';
import logo from '../../assets/icon.png';

const c = theme.colors;
const isWeb = Platform.OS === 'web';
const previewUser: User = {
  id: 'demo',
  name: 'Preview account',
  email: 'dummy@example.com',
  image: null,
};

function Action({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled}
      variant={secondary ? 'outline' : 'default'}
      className="min-h-12 rounded-[10px] px-5"
      style={{
        backgroundColor: secondary ? c.surface : c.primary,
        borderColor: c.borderStrong,
        borderWidth: secondary ? 1 : 0,
      }}
    >
      <Text style={{ color: secondary ? c.text : c.onPrimary, fontSize: 14, fontWeight: '600' }}>
        {title}
      </Text>
    </Button>
  );
}

function WaveBar({
  height,
  index,
  motion,
}: {
  height: number;
  index: number;
  motion: ReturnType<typeof useSharedValue<number>>;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.4 + motion.value * (index % 2 ? 0.55 : 0.85) }],
  }));
  return (
    <Animated.View
      style={[{ width: 4, height, borderRadius: 4, backgroundColor: c.onChrome }, style]}
    />
  );
}

function RecordingPanel({
  status,
  onStop,
  onPreview,
}: {
  status: Snapshot['status'];
  onStop: () => void;
  onPreview: () => void;
}) {
  const reduced = useReducedMotion();
  const motion = useSharedValue(0);
  const scale = useSharedValue(1);
  const bubbleWidth = useSharedValue(112);
  useEffect(() => {
    motion.value =
      status === 'listening' && !reduced
        ? withRepeat(
            withSequence(withTiming(1, { duration: 330 }), withTiming(0, { duration: 420 })),
            -1,
            true,
          )
        : 0;
    if (!reduced)
      scale.value = withSequence(
        withTiming(status === 'saved' ? 1.025 : 1.01, { duration: 130 }),
        withTiming(1, { duration: 220 }),
      );
    const nextWidth = status === 'listening' ? 132 : status === 'processing' ? 116 : 112;
    bubbleWidth.value = reduced ? nextWidth : withTiming(nextWidth, { duration: 180 });
  }, [status, reduced, motion, scale, bubbleWidth]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const bubble = useAnimatedStyle(() => ({ width: bubbleWidth.value }));
  const listening = status === 'listening';
  const processing = status === 'processing' || status === 'connecting';
  const heading = listening
    ? 'Listening now'
    : status === 'processing'
      ? 'Finishing your words'
      : status === 'connecting'
        ? 'Connecting to transcription'
        : status === 'saved'
          ? 'Dictation saved'
          : 'Ready when you are';
  return (
    <Animated.View
      style={[
        { backgroundColor: c.chrome, borderRadius: 16, padding: 24, minHeight: 210 },
        animated,
      ]}
    >
      <View className="flex-row items-center justify-between">
        <Animated.View
          className="flex-row items-center gap-2"
          style={[{ backgroundColor: c.chromeRaised, borderRadius: 999, padding: 8 }, bubble]}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: listening ? '#c5d8cb' : c.onChromeMuted,
            }}
          />
          <Text style={{ color: c.onChromeMuted, fontSize: 13, fontWeight: '600' }}>
            {listening ? 'Recording' : processing ? 'Working' : 'Voice bubble'}
          </Text>
        </Animated.View>
        <View
          className="flex-row items-center gap-1"
          accessibilityLabel={listening ? 'Listening waveform' : 'Recording status'}
        >
          {[12, 22, 34, 20, 12].map((height, index) => (
            <WaveBar key={index} height={height} index={index} motion={motion} />
          ))}
        </View>
      </View>
      <Text
        style={{
          color: c.onChrome,
          fontSize: 25,
          fontWeight: '600',
          letterSpacing: -0.5,
          marginTop: 24,
        }}
      >
        {heading}
      </Text>
      <Text
        style={{
          color: c.onChromeMuted,
          fontSize: 14,
          lineHeight: 21,
          marginTop: 8,
          maxWidth: 320,
        }}
      >
        {listening
          ? 'Tap Stop when you finish. Text appears at the cursor.'
          : processing
            ? 'Your microphone is off. Final text is on its way.'
            : status === 'saved'
              ? 'Open a transcript below if you need to copy or paste it.'
              : 'Focus a text field in another app, then tap the VoxType bubble.'}
      </Text>
      {(listening || isWeb) && (
        <View style={{ marginTop: 20, alignSelf: 'flex-start' }}>
          <Action
            title={listening ? 'Stop recording' : 'Preview dummy recording'}
            onPress={listening ? onStop : onPreview}
            disabled={processing}
            secondary
          />
        </View>
      )}
    </Animated.View>
  );
}

function SetupRow({
  title,
  detail,
  ready,
  action,
  onPress,
}: {
  title: string;
  detail: string;
  ready: boolean;
  action: string;
  onPress: () => void;
}) {
  return (
    <View
      className="flex-row items-center justify-between gap-4 py-4"
      style={{ borderBottomWidth: 1, borderBottomColor: c.border }}
    >
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: ready ? c.success : c.warning,
            }}
          />
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        </View>
        <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
          {detail}
        </Text>
      </View>
      {ready ? (
        <Text style={{ color: c.success, fontSize: 13, fontWeight: '600' }}>On</Text>
      ) : (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={action}
          className="min-h-12 justify-center px-2"
        >
          <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function TranscriptRow({ item, onCopy }: { item: Dictation; onCopy: () => void }) {
  return (
    <View style={{ paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text selectable style={{ color: c.text, fontSize: 16, lineHeight: 25 }} numberOfLines={3}>
        {item.text || 'No transcript. The audio was saved on this phone.'}
      </Text>
      <View className="flex-row items-center justify-between gap-3" style={{ marginTop: 12 }}>
        <Text style={{ color: c.textMuted, fontSize: 12, flexShrink: 1 }}>
          {new Date(item.createdAt).toLocaleString()} ·{' '}
          {item.delivery === 'pasted'
            ? 'Inserted'
            : item.delivery === 'copied'
              ? 'Copied'
              : 'Saved'}
        </Text>
        <Pressable
          onPress={onCopy}
          disabled={!item.text}
          accessibilityRole="button"
          accessibilityLabel="Copy transcript"
          className="min-h-12 justify-center px-2"
        >
          <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>Copy</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [user, setUser] = useState<User | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const nativeAvailable = isWeb || isVoxTypeNativeAvailable();
  const [loading, setLoading] = useState(nativeAvailable);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [demoStatus, setDemoStatus] = useState<Snapshot['status'] | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const refresh = useCallback(async () => {
    if (!nativeAvailable) return;
    try {
      setSnapshot(await VoxTypeNative.getSnapshot());
    } catch {
      setMessage('Could not read this phone’s VoxType data. Reopen the app.');
    }
  }, [nativeAvailable]);
  useEffect(() => {
    if (!nativeAvailable) {
      const pendingTimers = timers.current;
      return () => {
        pendingTimers.forEach(clearTimeout);
      };
    }
    let mounted = true;
    void (async () => {
      try {
        const account = isWeb ? previewUser : await currentUser();
        if (mounted) setUser(account);
        if (account) await refresh();
      } catch {
        if (mounted)
          setMessage('Could not verify your account. Check your connection and reopen VoxType.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    const event = VoxTypeNative.addListener('onChange', () => {
      void refresh();
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const pendingTimers = timers.current;
    return () => {
      mounted = false;
      event.remove();
      appState.remove();
      pendingTimers.forEach(clearTimeout);
    };
  }, [refresh, nativeAvailable]);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await task();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const updatePreference = (
    key: 'bubbleEnabled' | 'cleanupEnabled' | 'audioLimit',
    value: boolean | number,
  ) => {
    void run(async () => {
      await VoxTypeNative.setPreference(key, String(value));
      await refresh();
    });
  };
  const stopPreview = () => {
    if (!isWeb) {
      void VoxTypeNative.stopRecording();
      return;
    }
    setDemoStatus('processing');
    timers.current.push(
      setTimeout(() => {
        setDemoStatus('saved');
        timers.current.push(setTimeout(() => setDemoStatus('idle'), 1600));
      }, 1000),
    );
  };
  const status = demoStatus || snapshot?.status || 'idle';

  return (
    <View className="flex-1" style={{ backgroundColor: c.background }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 24,
          alignItems: 'center',
        }}
      >
        <View style={{ width: '100%', maxWidth: width >= 700 ? 760 : 480 }}>
          {isWeb && (
            <View
              style={{
                backgroundColor: c.warningContainer,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 22,
              }}
            >
              <Text style={{ color: c.warning, fontSize: 12, fontWeight: '600' }}>
                Web preview · Dummy data · Android features are unavailable here
              </Text>
            </View>
          )}
          {!isWeb && !nativeAvailable && (
            <View
              style={{
                backgroundColor: c.warningContainer,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 22,
              }}
            >
              <Text style={{ color: c.warning, fontSize: 12, fontWeight: '600' }}>
                Dev build required · This build has no VoxType native code (for example Expo Go).
                Install a VoxType dev client to use the bubble and dictation.
              </Text>
            </View>
          )}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <Image
                source={logo}
                style={{ width: 35, height: 35, borderRadius: 10 }}
                accessibilityLabel="VoxType logo"
              />
              <Text style={{ color: c.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 }}>
                VoxType
              </Text>
            </View>
            {user && (
              <Pressable
                onPress={() =>
                  void run(async () => {
                    if (!isWeb) await signOut();
                    setUser(null);
                    setSnapshot(null);
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                className="min-h-12 justify-center px-2"
              >
                <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>
                  Sign out
                </Text>
              </Pressable>
            )}
          </View>
          {message ? (
            <View
              style={{
                backgroundColor: c.dangerContainer,
                borderRadius: 10,
                padding: 14,
                marginTop: 18,
              }}
            >
              <Text selectable style={{ color: c.danger, fontSize: 13, lineHeight: 19 }}>
                {message}
              </Text>
            </View>
          ) : null}
          {loading ? (
            <Text style={{ color: c.textMuted, marginTop: 40 }}>Opening VoxType…</Text>
          ) : !user ? (
            <View style={{ paddingTop: 76, maxWidth: 460 }}>
              <Text
                style={{
                  color: c.text,
                  fontSize: 32,
                  lineHeight: 38,
                  fontWeight: '600',
                  letterSpacing: -0.7,
                }}
              >
                Your words, wherever you type.
              </Text>
              <Text
                style={{
                  color: c.textMuted,
                  fontSize: 16,
                  lineHeight: 25,
                  marginTop: 18,
                  marginBottom: 32,
                }}
              >
                Use your usual keyboard. VoxType adds a small voice bubble to text fields in other
                apps.
              </Text>
              <Action
                title={isWeb ? 'Open dummy preview' : 'Sign in with Google'}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    setUser(isWeb ? previewUser : await signIn());
                    await refresh();
                  })
                }
              />
              <Text style={{ color: c.textMuted, fontSize: 12, lineHeight: 18, marginTop: 18 }}>
                Transcripts and recordings stay on this phone.
              </Text>
            </View>
          ) : (
            <>
              <View style={{ paddingTop: 42, paddingBottom: 28 }}>
                <Text
                  style={{
                    color: c.text,
                    fontSize: 30,
                    lineHeight: 36,
                    fontWeight: '600',
                    letterSpacing: -0.8,
                    maxWidth: 470,
                  }}
                >
                  Speak into any text field.
                </Text>
                <Text
                  style={{
                    color: c.textMuted,
                    fontSize: 15,
                    lineHeight: 23,
                    marginTop: 10,
                    maxWidth: 500,
                  }}
                >
                  Tap the bubble while your cursor is in another app. Stop speaking to insert the
                  finished text.
                </Text>
              </View>
              <RecordingPanel
                status={status}
                onStop={stopPreview}
                onPreview={() => setDemoStatus('listening')}
              />
              <View style={{ marginTop: 34 }}>
                <Text style={{ color: c.text, fontSize: 19, fontWeight: '600' }}>
                  Set up your bubble
                </Text>
                <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 19, marginTop: 5 }}>
                  Both permissions are needed for cross-app dictation.
                </Text>
                <SetupRow
                  title="Accessibility access"
                  detail="Shows the bubble beside editable fields."
                  ready={!!snapshot?.accessibilityEnabled}
                  action="Open settings"
                  onPress={() =>
                    void run(async () => {
                      await VoxTypeNative.openAccessibilitySettings();
                    })
                  }
                />
                <SetupRow
                  title="Microphone"
                  detail="Records only while you are dictating."
                  ready={!!snapshot?.microphoneGranted}
                  action="Allow"
                  onPress={() =>
                    void run(async () => {
                      const result = await requestRecordingPermissionsAsync();
                      if (!result.granted)
                        setMessage(
                          'Microphone access is off. Allow it in Android settings to dictate.',
                        );
                      await refresh();
                    })
                  }
                />
              </View>
              <View style={{ marginTop: 30 }}>
                <View className="flex-row items-end justify-between">
                  <Text style={{ color: c.text, fontSize: 19, fontWeight: '600' }}>
                    Recent transcripts
                  </Text>
                  <Text style={{ color: c.textMuted, fontSize: 12 }}>Stored on this phone</Text>
                </View>
                {!snapshot?.dictations.length ? (
                  <View
                    style={{
                      backgroundColor: c.surface,
                      borderRadius: 14,
                      padding: 20,
                      marginTop: 14,
                    }}
                  >
                    <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 22 }}>
                      No dictations yet. Focus a text field in another app and tap the bubble.
                    </Text>
                  </View>
                ) : (
                  snapshot.dictations.slice(0, 5).map((item) => (
                    <TranscriptRow
                      key={item.id}
                      item={item}
                      onCopy={() =>
                        void run(async () => {
                          if (isWeb) await Clipboard.setStringAsync(item.text);
                          else await VoxTypeNative.copyTranscript(item.id);
                          setMessage('Transcript copied. Paste it where you need it.');
                          await refresh();
                        })
                      }
                    />
                  ))
                )}
              </View>
              <View style={{ marginTop: 34 }}>
                <Text style={{ color: c.text, fontSize: 19, fontWeight: '600' }}>Preferences</Text>
                <View
                  className="flex-row items-center justify-between gap-4"
                  style={{ paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: c.border }}
                >
                  <View className="flex-1">
                    <Text style={{ color: c.text, fontSize: 14 }}>Show voice bubble</Text>
                    <Text style={{ color: c.textMuted, fontSize: 13 }}>
                      Only near editable fields.
                    </Text>
                  </View>
                  <Switch
                    value={!!snapshot?.bubbleEnabled}
                    onValueChange={(value) => updatePreference('bubbleEnabled', value)}
                    accessibilityLabel="Show voice bubble"
                    trackColor={{ true: c.primary }}
                  />
                </View>
                <View
                  className="flex-row items-center justify-between gap-4"
                  style={{ paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: c.border }}
                >
                  <View className="flex-1">
                    <Text style={{ color: c.text, fontSize: 14 }}>Clean up wording</Text>
                    <Text style={{ color: c.textMuted, fontSize: 13 }}>
                      Optional; original text is kept.
                    </Text>
                  </View>
                  <Switch
                    value={!!snapshot?.cleanupEnabled}
                    onValueChange={(value) => updatePreference('cleanupEnabled', value)}
                    accessibilityLabel="Clean up wording"
                    trackColor={{ true: c.primary }}
                  />
                </View>
                <View style={{ paddingTop: 18 }}>
                  <Text style={{ color: c.text, fontSize: 14 }}>Keep newest recording files</Text>
                  <View className="flex-row gap-2" style={{ marginTop: 12 }}>
                    {([5, 10, 15] as const).map((count) => (
                      <Pressable
                        key={count}
                        onPress={() => updatePreference('audioLimit', count)}
                        accessibilityRole="button"
                        accessibilityLabel={`Keep ${count} recording files`}
                        accessibilityState={{ selected: snapshot?.audioLimit === count }}
                        className="min-h-12 flex-1 items-center justify-center"
                        style={{
                          borderRadius: 10,
                          backgroundColor: snapshot?.audioLimit === count ? c.primary : c.surface,
                          borderWidth: 1,
                          borderColor: snapshot?.audioLimit === count ? c.primary : c.border,
                        }}
                      >
                        <Text
                          style={{
                            color: snapshot?.audioLimit === count ? c.onPrimary : c.text,
                            fontWeight: '600',
                          }}
                        >
                          {count}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={{ color: c.textMuted, fontSize: 12, lineHeight: 18, marginTop: 10 }}>
                    Older audio files are deleted automatically. Transcripts remain available.
                  </Text>
                </View>
              </View>
              <Text style={{ color: c.textMuted, fontSize: 12, lineHeight: 18, marginTop: 42 }}>
                {user.email}
                {isWeb ? ' · dummy account' : ''}
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
