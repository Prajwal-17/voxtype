import { View, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nativeTheme as theme } from '@voxtype/shared';
import { XIcon } from 'phosphor-react-native/src/icons/X';
import { ArrowLeftIcon } from 'phosphor-react-native/src/icons/ArrowLeft';
import { IconButton, Action, Text } from './primitives';
import { styles as ui } from './styles';
import { useAppState } from '../state/app-state';
const c = theme.colors;
export function Screen({
  title,
  children,
  scroll = true,
  actions,
  onBack,
  showAccount = true,
}: {
  title: string;
  children: ReactNode;
  scroll?: boolean;
  actions?: ReactNode;
  onBack?: () => void;
  showAccount?: boolean;
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
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: onBack ? insets.bottom : 0 }]}>
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
          {onBack && (
            <IconButton label="Back" onPress={onBack}>
              <ArrowLeftIcon size={22} color={c.text} />
            </IconButton>
          )}
          <Text accessibilityRole="header" style={[ui.heading, { flexShrink: 1 }]}>
            {title}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {actions}
          {!onBack && showAccount && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Profile and settings"
              onPress={() => router.navigate('/(tabs)/settings')}
              style={s.avatar}
            >
              <Text style={{ color: c.primary, fontWeight: '600' }}>
                {(app.user?.name[0] || 'V').toUpperCase()}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
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
      {app.message && (
        <View style={[s.message, { bottom: 12 + (onBack ? insets.bottom : 0) }]}>
          <Text
            accessibilityLiveRegion="polite"
            style={{
              flex: 1,
              fontSize: 13,
              lineHeight: 20,
              color: app.message.kind === 'error' ? c.danger : c.text,
            }}
          >
            {app.message.text}
          </Text>
          <IconButton label="Dismiss message" onPress={() => app.setMessage(null)}>
            <XIcon size={18} color={c.textMuted} />
          </IconButton>
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 16 },
  avatar: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: c.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    paddingLeft: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    elevation: 3,
  },
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
