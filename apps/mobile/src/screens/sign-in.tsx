import { Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Action, Loader, Text } from '../components/primitives';
import { styles as ui } from '../components/styles';
import { useAppState } from '../state/app-state';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const logo = require('../../assets/icon.png');
export function SignInScreen() {
  const app = useAppState(),
    insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        paddingTop: insets.top + 24,
        justifyContent: 'center',
        gap: 24,
      }}
    >
      <Image
        source={logo as import('react-native').ImageSourcePropType}
        style={{ width: 48, height: 48, borderRadius: 12 }}
        accessibilityLabel="VoxType"
      />
      {app.loading ? (
        <Loader />
      ) : (
        <>
          <Text accessibilityRole="header" style={ui.heading}>
            Sign in
          </Text>
          <Action
            label={app.busy ? 'Waiting for Google' : 'Continue with Google'}
            disabled={app.busy || !app.available}
            onPress={() => void app.login()}
          />
          {app.message && <Text accessibilityLiveRegion="polite">{app.message.text}</Text>}
          {!app.available && (
            <Text style={ui.muted}>Open the installed Android app to sign in.</Text>
          )}
        </>
      )}
    </View>
  );
}
