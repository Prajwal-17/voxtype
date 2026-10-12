import { View, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nativeTheme as theme } from '@voxtype/shared';
import { Action, Text } from './primitives';
import { styles as ui } from './styles';
import { useAppState } from '../state/app-state';
const c = theme.colors;
export function Screen({
  title,
  children,
  scroll = true,
  actions,
}: {
  title: string;
  children: ReactNode;
  scroll?: boolean;
  actions?: ReactNode;
}) {
  const insets = useSafeAreaInsets(),
    app = useAppState(),
    inApp = app.snapshot?.inApp;
  const active = inApp?.status === 'listening' || inApp?.status === 'processing';
  const content = scroll ? (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1 }}>{children}</View>
  );
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text accessibilityRole="header" style={ui.heading}>
          {title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {actions}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={title === 'Account' ? 'Back' : 'Account'}
            onPress={() => (title === 'Account' ? router.back() : router.push('/account'))}
            style={s.avatar}
          >
            <Text style={{ color: c.primary, fontWeight: '600' }}>
              {title === 'Account' ? '←' : (app.user?.name[0] || 'V').toUpperCase()}
            </Text>
          </Pressable>
        </View>
      </View>
      {app.message && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          onPress={() => app.setMessage(null)}
          style={[
            s.message,
            {
              backgroundColor:
                app.message.kind === 'error' ? c.dangerContainer : c.successContainer,
            },
          ]}
        >
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: app.message.kind === 'error' ? c.danger : c.success }}
          >
            {app.message.text}
          </Text>
        </Pressable>
      )}
      {active && title !== 'Home' && (
        <View style={s.banner}>
          <Text style={{ flex: 1 }}>
            {inApp.status === 'listening' ? 'Recording' : 'Transcribing'}
          </Text>
          <Action
            label="Finish"
            secondary
            disabled={app.busy || inApp.status !== 'listening'}
            onPress={() => void app.finish()}
          />
          <Action label="Cancel" secondary disabled={app.busy} onPress={() => void app.cancel()} />
        </View>
      )}
      {content}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 16 },
  avatar: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: c.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { padding: 12, marginHorizontal: 16, marginBottom: 12, borderRadius: 10 },
  banner: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    gap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    backgroundColor: c.primaryContainer,
    borderRadius: 10,
  },
});
