import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { nativeTheme as theme } from '@voxtype/shared';
import { Dictionary } from '../components/dictionary';
import { Screen } from '../components/screen';
import { Action, Card, Setting, Text } from '../components/primitives';
import { styles as ui } from '../components/styles';
import { useAppState } from '../state/app-state';
import { accessibilityLabel, bubbleDiagnostics } from '../lib/bubble-health';
import Native from '../../modules/voxtype-native/src/VoxTypeNativeModule';
const c = theme.colors;
export default function SettingsScreen() {
  const app = useAppState(),
    snapshot = app.snapshot;
  const active =
    ['listening', 'processing'].includes(snapshot?.inApp.status ?? '') ||
    ['listening', 'connecting', 'processing'].includes(snapshot?.status ?? '');
  return (
    <Screen title="Settings">
      <Card>
        <Text accessibilityRole="header" style={ui.title}>
          Recording
        </Text>
        <Setting
          label="Voice bubble"
          value={!!snapshot?.bubbleEnabled}
          disabled={!app.available || app.busy || active}
          onChange={(value) =>
            void app.run(async () => {
              await Native.setBubbleEnabled(value);
              await app.refresh();
            })
          }
        />
        {snapshot?.bubbleEnabled && (
          <>
            <Text style={[ui.muted, { marginBottom: 12 }]}>
              Appears beside an active text field while the keyboard is open.
            </Text>
            <View style={{ gap: 12, marginBottom: 12 }}>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <Text>Accessibility</Text>
                <Text style={ui.muted}>
                  {accessibilityLabel(
                    snapshot.accessibilityEnabled,
                    snapshot.accessibilityConnected,
                  )}
                </Text>
              </View>
              <Action
                label={
                  snapshot.accessibilityEnabled ? 'Accessibility settings' : 'Enable accessibility'
                }
                secondary
                disabled={!app.available || app.busy}
                onPress={() => void app.run(() => Native.openAccessibilitySettings())}
              />
              {snapshot.accessibilityEnabled && !snapshot.accessibilityConnected && (
                <Text accessibilityLiveRegion="polite" style={{ color: c.danger }}>
                  Waiting for Android to reconnect. Check accessibility and background settings if
                  it stays disconnected.
                </Text>
              )}
              {!snapshot.accessibilityEnabled && (
                <Text style={ui.muted}>Enable VoxType in Android Settings to use the bubble.</Text>
              )}
            </View>
          </>
        )}
        <View style={{ gap: 12, paddingVertical: 12, borderTopWidth: 1, borderColor: c.border }}>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <Text>Microphone</Text>
            <Text style={ui.muted}>
              {snapshot?.microphoneGranted ? 'Allowed' : 'Permission required'}
            </Text>
          </View>
          <Action
            label={snapshot?.microphoneGranted ? 'App permissions' : 'Allow microphone'}
            secondary
            disabled={!app.available || app.busy || active}
            onPress={() =>
              void app.run(async () => {
                if (snapshot?.microphoneGranted) await Linking.openSettings();
                else await app.microphone();
              })
            }
          />
        </View>
        <Setting
          label="Clean up wording"
          value={!!snapshot?.cleanupEnabled}
          disabled={!app.available || app.busy || active}
          onChange={(value) =>
            void app.run(async () => {
              await Native.setCleanupEnabled(value);
              await app.refresh();
            })
          }
        />
      </Card>
      {snapshot && (
        <Dictionary
          key={app.user?.id}
          terms={snapshot.vocabulary ?? []}
          disabled={!app.available || app.busy || active}
        />
      )}
      {snapshot?.bubbleEnabled && (
        <Card style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={ui.title}>
            Background access
          </Text>
          {!!snapshot.bubbleHealth?.foregroundError && (
            <Text accessibilityLiveRegion="polite" style={{ color: c.danger }}>
              Background protection unavailable. Check app settings.
            </Text>
          )}
          <Text style={ui.muted}>
            On iQOO or vivo, allow Autostart and background power usage for VoxType.
          </Text>
          <Action
            label="App background settings"
            secondary
            disabled={!app.available || app.busy}
            onPress={() => void app.run(() => Linking.openSettings())}
          />
          <Action
            label="Copy bubble diagnostics"
            secondary
            disabled={!app.available || app.busy}
            onPress={() =>
              void app.run(async () => {
                const latest = await Native.getSnapshot();
                await Clipboard.setStringAsync(bubbleDiagnostics(latest));
                app.notify('Diagnostics copied');
              })
            }
          />
        </Card>
      )}
      <Action label="Account →" secondary onPress={() => router.push('/account')} />
      {snapshot?.appHealth && (
        <Card style={{ gap: 12 }}>
          <Text style={ui.muted}>
            {snapshot.appHealth.appName} · {snapshot.appHealth.appVersion}
          </Text>
          {snapshot.appHealth.lastExit && (
            <Text style={ui.muted}>
              Previous Android exit: {snapshot.appHealth.lastExit.reason.replaceAll('_', ' ')}
            </Text>
          )}
          <Action
            label="Copy app diagnostics"
            secondary
            disabled={!app.available || app.busy}
            onPress={() =>
              void app.run(async () => {
                const latest = await Native.getSnapshot();
                await Clipboard.setStringAsync(JSON.stringify(latest.appHealth, null, 2));
                app.notify('Diagnostics copied');
              })
            }
          />
        </Card>
      )}
    </Screen>
  );
}
