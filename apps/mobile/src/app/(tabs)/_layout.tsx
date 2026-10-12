import { useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WaveformIcon } from 'phosphor-react-native/src/icons/Waveform';
import { FileTextIcon } from 'phosphor-react-native/src/icons/FileText';
import { ChartBarIcon } from 'phosphor-react-native/src/icons/ChartBar';
import { SlidersHorizontalIcon } from 'phosphor-react-native/src/icons/SlidersHorizontal';
import { nativeTheme as theme } from '@voxtype/shared';
import { useAppState } from '../../state/app-state';
import { SignInScreen } from '../../screens/sign-in';
export default function TabLayout() {
  const { fontScale } = useWindowDimensions();
  const app = useAppState(),
    insets = useSafeAreaInsets();
  if (!app.user || app.loading) return <SignInScreen />;
  return (
    <>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            height: 70 + insets.bottom + Math.max(0, (fontScale - 1) * 18),
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 6),
          },
          tabBarLabelStyle: { fontFamily: 'MonaSansMedium', fontSize: 12, lineHeight: 18 },
          tabBarIconStyle: { height: 24, width: 24 },
          tabBarItemStyle: { paddingVertical: 3, minHeight: 52 },
          sceneStyle: { backgroundColor: theme.colors.background },
        }}
      >
        {(
          [
            { name: 'home', title: 'Home', icon: WaveformIcon },
            { name: 'transcripts', title: 'Transcripts', icon: FileTextIcon },
            { name: 'insights', title: 'Insights', icon: ChartBarIcon },
            { name: 'settings', title: 'Settings', icon: SlidersHorizontalIcon },
          ] as const
        ).map(({ name, title, icon: Icon }) => (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title,
              tabBarIcon: ({ color, focused }) => (
                <Icon size={23} color={String(color)} weight={focused ? 'fill' : 'regular'} />
              ),
            }}
          />
        ))}
      </Tabs>
    </>
  );
}
