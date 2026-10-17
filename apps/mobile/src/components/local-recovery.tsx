import { useEffect, useState } from 'react';
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
    [retry, setRetry] = useState(0);
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
  return (
    <Card style={{ gap: 8 }}>
      <Action
        label={open ? 'Hide local recordings' : 'Local recordings & originals'}
        secondary
        onPress={() => setOpen(!open)}
      />
      <Text style={ui.muted}>
        Latest 10 takes on this device. Raw originals and audio stay local. Export or copy to
        recover a take.
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
                {row.originalText || 'No transcript received. Recover the audio if available.'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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
            </View>
          ))
        ))}
    </Card>
  );
}
