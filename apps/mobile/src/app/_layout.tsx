import '../global.css';

import * as WebBrowser from 'expo-web-browser';
import { Slot } from 'expo-router';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { Loader } from '../components/primitives';
import { useFonts } from 'expo-font';

WebBrowser.maybeCompleteAuthSession();
void SplashScreen.preventAutoHideAsync();

export default function Layout() {
  // Expo's asset bundler requires a static require for local fonts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const [loaded, error] = useFonts({ MonaSans: require('../../assets/fonts/MonaSans.ttf') });
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!loaded && !error) return <Loader />;
  return (
    <SafeAreaProvider>
      <ReducedMotionConfig mode={ReduceMotion.System} />
      <Slot />
    </SafeAreaProvider>
  );
}
