import '../global.css';

import * as WebBrowser from 'expo-web-browser';
import { Slot } from 'expo-router';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';

WebBrowser.maybeCompleteAuthSession();

export default function Layout() {
  // Expo's asset bundler requires a static require for local fonts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const [loaded] = useFonts({ MonaSans: require('../../assets/fonts/MonaSans.ttf') });
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <ReducedMotionConfig mode={ReduceMotion.System} />
      <Slot />
    </SafeAreaProvider>
  );
}
