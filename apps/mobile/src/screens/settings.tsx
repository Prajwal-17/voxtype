import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { nativeTheme as theme } from '@voxtype/shared';
import { Dictionary } from '../components/dictionary';
import { Screen } from '../components/screen';
import { Action, Card, Setting, SettingLink, Text } from '../components/primitives';
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
    <Screen title="Settings" showAccount={false}>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.primaryContainer,
            }}
          >
            <Text style={{ color: c.primary, fontWeight: '600' }}>
              {(app.user?.name[0] || 'V').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>{app.user?.name}</Text>
            {!!app.user?.email && (
              <Text selectable style={ui.muted}>
                {app.user.email}
              </Text>
            )}
          </View>
          <Action
            label="Sign out"
            secondary
            disabled={!app.available || app.busy || active}
            onPress={() => void app.logout()}
          />
        </View>
        {snapshot?.syncing && (
          <Text accessibilityLiveRegion="polite" style={ui.muted}>
            Syncing transcripts…
          </Text>
        )}
        {!!snapshot?.syncError && (
          <View style={{ gap: 4 }}>
            <Text accessibilityRole="alert" style={ui.muted}>
              {snapshot.syncError}
            </Text>
            <Action
              label="Retry sync"
              secondary
              disabled={!app.available || app.busy}
              onPress={() => void app.run(() => Native.syncTranscripts())}
            />
          </View>
        )}
      </Card>
      <Text style={ui.muted}>Recording</Text>
      <Card>
        <Setting
          label="Voice bubble"
          detail="Type in other apps"
          value={!!snapshot?.bubbleEnabled}
          disabled={!app.available || app.busy || active}
          onChange={(value) =>
            void app.run(async () => {
              await Native.setBubbleEnabled(value);
              await app.refresh();
            })
          }
        />
        {snapshot?.bubbleEnabled && !snapshot.accessibilityEnabled && (
          <SettingLink
            label="Enable voice bubble access"
            disabled={!app.available || app.busy}
            onPress={() => void app.run(() => Native.openAccessibilitySettings())}
          />
        )}
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
        <SettingLink
          label="Personal dictionary"
          detail={`${snapshot?.dictionaryUserId === app.user?.id ? (snapshot?.vocabulary?.length ?? 0) : 0} words`}
          onPress={() => open('dictionary')}
        />
      </Card>
      <Text style={ui.muted}>App</Text>
      <Card>
        <SettingLink
          label="Permissions"
          detail={snapshot?.microphoneGranted ? undefined : 'Microphone access needed'}
          onPress={() => open('permissions')}
        />
        {snapshot?.accessibilityEnabled && (
          <SettingLink
            label="Pause bubble for payments"
            disabled={!app.available || app.busy || active}
            onPress={() =>
              void app.run(async () => {
                await Native.pauseForPayments();
                await app.refresh();
              })
            }
          />
        )}
        <SettingLink label="Help & diagnostics" onPress={() => open('diagnostics')} />
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
              detail={snapshot?.microphoneGranted ? 'Allowed' : 'Tap to allow microphone access'}
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
                Not connected. Re-enable VoxType in accessibility settings.
              </Text>
            )}
          </Card>
          <Text style={ui.title}>Using payment apps</Text>
          <Text style={ui.muted}>
            Payment app blocking you? Pause accessibility access, then re-enable VoxType after
            paying. Turning off the bubble alone won’t pause this access.
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
          <Text style={ui.title}>Bubble not appearing?</Text>
          <Text style={ui.muted}>
            Allow background access for VoxType. On iQOO or vivo, also enable Autostart.
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
            Share these logs when asking for help. Your text and sign-in details are excluded.
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
