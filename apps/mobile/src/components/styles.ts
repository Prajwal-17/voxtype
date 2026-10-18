import { StyleSheet } from 'react-native';
import { nativeTheme as theme } from '@voxtype/shared';
const c = theme.colors;
export const styles = StyleSheet.create({
  text: { fontFamily: 'MonaSansRegular', fontSize: 15, lineHeight: 22, color: c.text },
  card: {
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 16,
  },
  action: {
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 48,
    maxWidth: '100%',
    backgroundColor: c.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondary: {
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
    flexShrink: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  loader: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  setting: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heading: { fontSize: 22, lineHeight: 30, fontWeight: '600', letterSpacing: -0.4 },
  title: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  muted: { color: c.textMuted, fontSize: 13, lineHeight: 20 },
});
