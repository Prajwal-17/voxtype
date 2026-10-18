import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { nativeTheme as theme } from '@voxtype/shared';
import { Dictionary } from '../components/dictionary';
import { Screen } from '../components/screen';
import { Card, Setting, SettingLink, Text } from '../components/primitives';
import { styles as ui } from '../components/styles';
import { useAppState } from '../state/app-state';
import { accessibilityLabel, bubbleDiagnostics } from '../lib/bubble-health';
import appConfig from '../../app.json';
import Native from '../../modules/voxtype-native/src/VoxTypeNativeModule';
const c = theme.colors;
const open = (section: string) => router.push({ pathname: '/preferences', params: { section } });
export default function SettingsScreen() {
  const app = useAppState(),
    snapshot = app.snapshot;
  const active =
    ['listening', 'processing'].includes(snapshot?.inApp.status ?? '') ||
    ['listening', 'connecting', 'processing'].includes(snapshot?.status ?? '');
  return (
    <Screen title="Settings">
      <Text style={ui.muted}>Recording</Text>
      <Card>
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
        <Text style={[ui.muted, { paddingBottom: 12 }]}>
          Dictate into other apps with your keyboard open.
        </Text>
        {snapshot?.bubbleEnabled && !snapshot.accessibilityEnabled && (
          <SettingLink
            label="Enable accessibility"
            detail="Required for the voice bubble"
            disabled={!app.available || app.busy}
            onPress={() => void app.run(() => Native.openAccessibilitySettings())}
          />
        )}
        <View style={{ borderTopWidth: 1, borderColor: c.border }}>
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
          <Text style={[ui.muted, { paddingBottom: 8 }]}>
            Polish your transcript after recording.
          </Text>
        </View>
        <SettingLink
          label="Personal dictionary"
          detail={`${snapshot?.dictionaryUserId === app.user?.id ? (snapshot?.vocabulary?.length ?? 0) : 0} saved terms`}
          onPress={() => open('dictionary')}
        />
      </Card>
      <Text style={ui.muted}>App & access</Text>
      <Card>
        <SettingLink
          label="Permissions"
          detail={snapshot?.microphoneGranted ? 'Microphone allowed' : 'Microphone access needed'}
          onPress={() => open('permissions')}
        />
        {snapshot?.accessibilityEnabled && (
          <SettingLink
            label="Pause for payments"
            detail="Turn off accessibility access before paying"
            disabled={!app.available || app.busy}
            onPress={() =>
              void app.run(async () => {
                await Native.pauseForPayments();
                await app.refresh();
              })
            }
          />
        )}
        <SettingLink
          label="Account & storage"
          detail={app.user?.email || 'Sync and sign-in'}
          onPress={() => router.push('/account')}
        />
        <SettingLink
          label="Help & diagnostics"
          detail="Background access and troubleshooting"
          onPress={() => open('diagnostics')}
        />
      </Card>
      <Text style={[ui.muted, { textAlign: 'center', paddingVertical: 8 }]}>
        {snapshot?.appHealth?.appName ?? 'VoxType'} ·{' '}
        {snapshot?.appHealth?.appVersion ?? appConfig.expo.version}
        {snapshot?.appHealth?.versionCode != null ? ` (${snapshot.appHealth.versionCode})` : ''}
        {app.preview ? ' · Web preview' : ''}
      </Text>
    </Screen>
  );
}
export function SettingsDetails() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const app = useAppState(),
    snapshot = app.snapshot;
  const active =
    ['listening', 'processing'].includes(snapshot?.inApp.status ?? '') ||
    ['listening', 'connecting', 'processing'].includes(snapshot?.status ?? '');
  const disabled = !app.available || app.busy;
  const title =
    section === 'dictionary'
      ? 'Personal dictionary'
      : section === 'permissions'
        ? 'Permissions'
        : 'Help & diagnostics';
  return (
    <Screen title={title} onBack={() => router.back()}>
      {section === 'dictionary' ? (
        <Dictionary
          key={app.user?.id}
          terms={snapshot?.dictionaryUserId === app.user?.id ? (snapshot?.vocabulary ?? []) : []}
          disabled={disabled || active}
        />
      ) : section === 'permissions' ? (
        <>
          <Card>
            <SettingLink
              label="Microphone"
              detail={
                snapshot?.microphoneGranted
                  ? 'Allowed · Open app permissions'
                  : 'Tap to allow microphone access'
              }
              disabled={disabled || active}
              onPress={() =>
                void app.run(async () => {
                  if (snapshot?.microphoneGranted) await Linking.openSettings();
                  else await app.microphone();
                })
              }
            />
            <SettingLink
              label="Accessibility"
              detail={
                snapshot
                  ? accessibilityLabel(
                      snapshot.accessibilityEnabled,
                      snapshot.accessibilityConnected,
                    )
                  : 'Not available'
              }
              disabled={disabled}
              onPress={() => void app.run(() => Native.openAccessibilitySettings())}
            />
            {snapshot?.accessibilityEnabled && !snapshot.accessibilityConnected && (
              <Text style={[ui.muted, { color: c.danger }]}>
                Waiting for Android to reconnect. Check accessibility and background access if this
                continues.
              </Text>
            )}
          </Card>
          <Text style={ui.title}>Using payment apps</Text>
          <Text style={ui.muted}>
            Some payment apps, including Paytm, require accessibility access to be off. Pause
            VoxType before paying, then re-enable it in Android accessibility settings. Hiding the
            voice bubble does not turn off this access.
          </Text>
          {snapshot?.accessibilityEnabled && (
            <SettingLink
              label="Pause for payments"
              disabled={disabled}
              onPress={() =>
                void app.run(async () => {
                  await Native.pauseForPayments();
                  await app.refresh();
                })
              }
            />
          )}
        </>
      ) : (
        <>
          <Text style={ui.title}>Keep the bubble available</Text>
          <Text style={ui.muted}>
            On iQOO or vivo, allow Autostart and background power usage for VoxType.
          </Text>
          {!!snapshot?.bubbleHealth?.foregroundError && (
            <Text accessibilityRole="alert" style={{ color: c.danger }}>
              Background protection unavailable. Check app settings.
            </Text>
          )}
          <Card>
            <SettingLink
              label="Background settings"
              disabled={disabled}
              onPress={() => void app.run(() => Linking.openSettings())}
            />
          </Card>
          <Text style={ui.title}>Diagnostics</Text>
          <Text style={ui.muted}>
            Recording and delivery events stay on this device for 14 days, up to 500 events. Text,
            credentials and target app details are excluded.
          </Text>
          <Card>
            <SettingLink
              label="Copy recording diagnostics"
              disabled={disabled}
              onPress={() =>
                void app.run(async () => {
                  await Clipboard.setStringAsync(await Native.getLocalDiagnostics());
                  app.notify('Diagnostics copied');
                })
              }
            />
            <SettingLink
              label="Export recording diagnostics"
              disabled={disabled}
              onPress={() => void app.run(() => Native.shareLocalDiagnostics())}
            />
            <SettingLink
              label="Copy bubble diagnostics"
              disabled={disabled}
              onPress={() =>
                void app.run(async () => {
                  await Clipboard.setStringAsync(bubbleDiagnostics(await Native.getSnapshot()));
                  app.notify('Diagnostics copied');
                })
              }
            />
            <SettingLink
              label="Copy app diagnostics"
              disabled={disabled}
              onPress={() =>
                void app.run(async () => {
                  const latest = await Native.getSnapshot();
                  await Clipboard.setStringAsync(JSON.stringify(latest.appHealth, null, 2));
                  app.notify('Diagnostics copied');
                })
              }
            />
          </Card>
          {snapshot?.appHealth?.lastExit && (
            <Text style={ui.muted}>
              Previous Android exit: {snapshot.appHealth.lastExit.reason.replaceAll('_', ' ')}
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}
