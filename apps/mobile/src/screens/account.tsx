import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Screen } from '../components/screen';
import { Action, Card, Text } from '../components/primitives';
import { styles as ui } from '../components/styles';
import { useAppState } from '../state/app-state';
import Native from '../../modules/voxtype-native/src/VoxTypeNativeModule';
export default function AccountScreen() {
  const app = useAppState();
  if (!app.user) return <Redirect href="/(tabs)/home" />;
  return (
    <Screen title="Account" onBack={() => router.back()}>
      <Card style={{ gap: 12 }}>
        <Text style={ui.title}>{app.user.name}</Text>
        {!!app.user.email && (
          <Text selectable style={ui.muted}>
            {app.user.email}
          </Text>
        )}
        <Text style={ui.muted}>Connected with Google</Text>
      </Card>
      <Card style={{ gap: 12 }}>
        <Text style={ui.title}>Storage</Text>
        <Text style={ui.muted}>
          Cleaned transcripts sync with your account. The newest 10 audio recordings and raw
          originals, device preferences and 14-day diagnostics stay on this device.
        </Text>
        {app.snapshot?.syncing && (
          <Text accessibilityLiveRegion="polite" style={ui.muted}>
            Syncing
          </Text>
        )}
        {!!app.snapshot?.syncError && (
          <>
            <Text accessibilityLiveRegion="polite" style={ui.muted}>
              {app.snapshot.syncError}
            </Text>
            <Action
              label="Retry sync"
              secondary
              disabled={!app.available || app.busy}
              onPress={() => void app.run(() => Native.syncTranscripts())}
            />
          </>
        )}
      </Card>
      <View>
        <Action
          label="Sign out"
          secondary
          disabled={!app.available || app.busy}
          onPress={() => void app.logout()}
        />
      </View>
    </Screen>
  );
}
