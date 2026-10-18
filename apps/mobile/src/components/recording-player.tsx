import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
  setIsAudioActiveAsync,
} from 'expo-audio';
import { AppState, View } from 'react-native';
import { PlayIcon } from 'phosphor-react-native/src/icons/Play';
import { PauseIcon } from 'phosphor-react-native/src/icons/Pause';
import { ArrowCounterClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowCounterClockwise';
import { nativeTheme as theme } from '@voxtype/shared';
import Native from '../../modules/voxtype-native/src/VoxTypeNativeModule';
import { useAppState } from '../state/app-state';
import { Action, IconButton, Loader, Text } from './primitives';
import { audioTime } from '../lib/audio-time';
import { styles as ui } from './styles';
const c = theme.colors;
/** Mount in the reader, outside virtualized rows. Each source gets its own managed player. */
export function RecordingPlayer({ id, autoPlay = false }: { id: string; autoPlay?: boolean }) {
  const { user, snapshot } = useAppState();
  const [uri, setUri] = useState<string | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const userId = user?.id;
  const blocked =
    ['listening', 'processing'].includes(snapshot?.inApp.status ?? '') ||
    ['connecting', 'listening', 'processing'].includes(snapshot?.status ?? '');
  useEffect(() => {
    let active = true;
    if (!userId || blocked) return;
    void (async () => {
      await setIsAudioActiveAsync(true);
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'doNotMix',
      });
      const source = await Native.getRecordingUri(id, userId);
      if (active) {
        setUri(source);
        setError('');
      }
    })().catch(() => {
      if (active) setError('Couldn’t open this recording. Try again or export the audio.');
    });
    return () => {
      active = false;
    };
  }, [id, userId, retry, blocked]);
  return (
    <View style={{ padding: 12, backgroundColor: c.surfaceSubtle, borderRadius: 12, gap: 4 }}>
      {error ? (
        <>
          <Text style={{ color: c.danger, fontSize: 13 }}>{error}</Text>
          <Action
            label="Retry playback"
            secondary
            onPress={() => {
              setError('');
              setRetry((n) => n + 1);
            }}
          />
        </>
      ) : uri ? (
        <LoadedPlayer
          key={`${id}:${uri}:${retry}`}
          uri={uri}
          autoPlay={autoPlay}
          blocked={blocked}
          onError={setError}
        />
      ) : blocked ? null : (
        <Loader label="Opening recording" />
      )}
      {blocked && <Text style={ui.muted}>Finish recording before playing audio.</Text>}
    </View>
  );
}
function LoadedPlayer({
  uri,
  autoPlay,
  blocked,
  onError,
}: {
  uri: string;
  autoPlay: boolean;
  blocked: boolean;
  onError: (message: string) => void;
}) {
  const player = useAudioPlayer({ uri }, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const pending = useRef(autoPlay);
  const [finished, setFinished] = useState(false);
  const fail = useCallback(
    () => onError('Playback failed. Try again or export the audio.'),
    [onError],
  );
  useEffect(() => {
    if (status.error) fail();
  }, [status.error, fail]);
  useEffect(() => {
    if (status.isLoaded) return;
    const timer = setTimeout(fail, 12000);
    return () => clearTimeout(timer);
  }, [status.isLoaded, fail]);
  useEffect(() => {
    if (blocked) {
      pending.current = false;
      player.pause();
    } else if (status.isLoaded && pending.current && AppState.currentState === 'active') {
      pending.current = false;
      player.play();
    }
  }, [blocked, status.isLoaded, player]);
  useEffect(() => {
    // didJustFinish is transient; remember it so replay works after later status updates.
    if (status.didJustFinish) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- persist a native completion event
      setFinished(true);
    }
  }, [status.didJustFinish]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        pending.current = false;
        player.pause();
      }
    });
    return () => subscription.remove();
  }, [player]);
  const play = async (restart = false) => {
    try {
      if (status.playing && !restart) {
        player.pause();
        return;
      }
      if (restart || finished || (status.duration > 0 && status.currentTime >= status.duration))
        await player.seekTo(0);
      setFinished(false);
      player.play();
    } catch {
      fail();
    }
  };
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconButton
          label={
            status.playing ? 'Pause recording' : finished ? 'Replay recording' : 'Play recording'
          }
          disabled={blocked || !status.isLoaded}
          onPress={() => void play()}
        >
          {status.playing ? (
            <PauseIcon size={24} weight="fill" color={c.primary} />
          ) : (
            <PlayIcon size={24} weight="fill" color={c.primary} />
          )}
        </IconButton>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '500' }}>
            {!status.isLoaded
              ? 'Loading audio…'
              : status.isBuffering
                ? 'Buffering…'
                : status.playing
                  ? 'Playing recording'
                  : finished
                    ? 'Recording finished'
                    : 'Recording'}
          </Text>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Recording progress"
            accessibilityValue={{
              min: 0,
              max: Math.max(1, Math.floor(status.duration)),
              now: Math.floor(status.currentTime),
            }}
            style={{ height: 3, backgroundColor: c.border, borderRadius: 2 }}
          >
            <View
              style={{
                height: 3,
                backgroundColor: c.primary,
                borderRadius: 2,
                width: `${Math.min(100, status.duration ? (status.currentTime / status.duration) * 100 : 0)}%`,
              }}
            />
          </View>
          <Text style={[ui.muted, { fontVariant: ['tabular-nums'] }]}>
            {audioTime(status.currentTime)} / {audioTime(status.duration)}
          </Text>
        </View>
        <IconButton
          label="Restart recording"
          disabled={blocked || !status.isLoaded}
          onPress={() => void play(true)}
        >
          <ArrowCounterClockwiseIcon size={20} color={c.textMuted} />
        </IconButton>
      </View>
    </>
  );
}
