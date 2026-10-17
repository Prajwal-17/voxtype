import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Native from '../../modules/voxtype-native/src/VoxTypeNativeModule';
import type { LocalRecording } from '../../modules/voxtype-native/src/VoxTypeNative.types';
import { useAppState } from '../state/app-state';
import { Action, Card, Text } from './primitives';
import { styles as ui } from './styles';
export function LocalRecovery() {
  const app = useAppState();
  const { available, revision, user } = app;
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<LocalRecording[]>([]),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0),
    [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const player = useAudioPlayer(null);
  const playback = useAudioPlayerStatus(player);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playbackRequest = useRef(0);
  useFocusEffect(
    useCallback(
      () => () => {
        playbackRequest.current++;
        player.pause();
      },
      [player],
    ),
  );
  const play = (id: string) =>
    void app.run(async () => {
      if (!user) return;
      if (playingId === id) {
        if (playback.playing) player.pause();
        else {
          if (playback.didJustFinish) await player.seekTo(0);
          player.play();
        }
        return;
      }
      const sequence = ++playbackRequest.current;
      const uri = await Native.getRecordingUri(id, user.id);
      if (sequence !== playbackRequest.current) return;
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
      if (sequence !== playbackRequest.current) return;
      player.replace({ uri });
      setPlayingId(id);
      player.play();
    });
  const regenerate = (id: string) =>
    void app.run(async () => {
      if (!user) return;
      player.pause();
      playbackRequest.current++;
      setRegeneratingId(id);
      try {
        await Native.regenerateTranscript(id, user.id);
        setRetry((n) => n + 1);
        await app.refresh();
        app.notify('Transcript regenerated and replaced');
      } finally {
        setRegeneratingId(null);
      }
    });
  const recording =
    ['listening', 'processing'].includes(app.snapshot?.inApp.status ?? '') ||
    ['listening', 'connecting', 'processing'].includes(app.snapshot?.status ?? '');
  useEffect(() => {
    if (!open || !available || !user) return;
    let disposed = false;
    void Native.getLocalRecordings()
      .then((next) => {
        if (!disposed) {
          setRows(next);
          setError(false);
        }
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
    };
  }, [open, available, user, revision, retry]);
  useEffect(() => {
    if (recording || !open) {
      playbackRequest.current++;
      player.pause();
    }
  }, [recording, open, player]);
  return (
    <Card style={{ gap: 8 }}>
      <Action
        label={open ? 'Hide local recordings' : 'Local recordings & originals'}
        secondary
        onPress={() => setOpen(!open)}
      />
      <Text style={ui.muted}>
        Latest 10 takes on this device. Play saved audio or regenerate its text. Regenerating sends
        the recording for transcription and replaces the existing text.
      </Text>
      {open &&
        (error ? (
          <Action label="Retry local recordings" secondary onPress={() => setRetry((n) => n + 1)} />
        ) : !rows.length ? (
          <Text style={ui.muted}>No local recordings available.</Text>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={{ gap: 8, paddingVertical: 8 }}>
              <Text style={ui.muted}>{new Date(row.createdAt).toLocaleString()}</Text>
              <Text selectable>
                {row.originalText || 'No transcript received. Play or regenerate the saved audio.'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Action
                  label={
                    playingId === row.id && playback.playing ? 'Pause recording' : 'Play recording'
                  }
                  secondary
                  disabled={!row.audioAvailable || app.busy || recording}
                  onPress={() => play(row.id)}
                />
                <Action
                  label={regeneratingId === row.id ? 'Regenerating…' : 'Regenerate text'}
                  secondary
                  disabled={!row.audioAvailable || app.busy || recording}
                  onPress={() => regenerate(row.id)}
                />
                <Action
                  label="Copy original"
                  secondary
                  disabled={!row.originalText || app.busy}
                  onPress={() =>
                    void app.run(async () => {
                      await Clipboard.setStringAsync(row.originalText);
                      app.notify('Original copied');
                    })
                  }
                />
                <Action
                  label="Export audio"
                  secondary
                  disabled={!row.audioAvailable || app.busy}
                  onPress={() => void app.run(() => Native.shareRecording(row.id))}
                />
              </View>
              {playingId === row.id && (
                <View style={{ gap: 8 }}>
                  <Text style={ui.muted}>
                    {Math.floor(playback.currentTime)} / {Math.floor(playback.duration)} seconds
                  </Text>
                  <Action
                    label="Restart playback"
                    secondary
                    disabled={app.busy || recording}
                    onPress={() =>
                      void app.run(async () => {
                        await player.seekTo(0);
                        player.play();
                      })
                    }
                  />
                </View>
              )}
            </View>
          ))
        ))}
    </Card>
  );
}
