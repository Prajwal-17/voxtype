import '../global.css';

import * as WebBrowser from 'expo-web-browser';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { View } from 'react-native';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { AppStateProvider } from '../state/app-state';
import { Action, Text } from '../components/primitives';
import { nativeTheme } from '@voxtype/shared';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';

WebBrowser.maybeCompleteAuthSession();
void SplashScreen.preventAutoHideAsync();

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        padding: 32,
        gap: 16,
        backgroundColor: nativeTheme.colors.background,
      }}
    >
      <Text>This screen couldn’t load.</Text>
      <Action label="Try again" onPress={() => void retry()} />
    </View>
  );
}

export default function Layout() {
  // Expo's asset bundler requires a static require for local fonts.
  const [loaded, error] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
    MonaSansRegular: require('../../assets/fonts/MonaSans-Regular.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
    MonaSansMedium: require('../../assets/fonts/MonaSans-Medium.ttf'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
    MonaSansSemiBold: require('../../assets/fonts/MonaSans-SemiBold.ttf'),
  });
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ReducedMotionConfig mode={ReduceMotion.System} />
      <AppStateProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="account" />
        </Stack>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
