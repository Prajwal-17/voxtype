import { StyleSheet } from 'react-native';
import { nativeTheme as theme } from '@voxtype/shared';
const c = theme.colors;
export const styles = StyleSheet.create({
  text: { fontFamily: 'MonaSans', fontSize: 15, lineHeight: 22, color: c.text },
  card: { backgroundColor: c.surface, borderRadius: 20, padding: 20 },
  action: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 18,
    backgroundColor: c.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondary: { backgroundColor: c.primaryContainer },
  loader: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  setting: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heading: { fontSize: 30, lineHeight: 38, fontWeight: '600', letterSpacing: -0.8 },
  title: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  muted: { color: c.textMuted, fontSize: 13, lineHeight: 20 },
});
