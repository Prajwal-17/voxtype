import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Switch,
  Text as NativeText,
  View,
  type TextProps,
  type ViewProps,
} from 'react-native';
import { nativeTheme as theme } from '@voxtype/shared';
import { styles } from './styles';
const c = theme.colors;
export function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[styles.text, style]} />;
}
export function Card({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.card, style]} />;
}
export function Action({
  label,
  onPress,
  disabled,
  secondary,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        secondary && styles.secondary,
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
      ]}
    >
      {icon}
      <Text style={{ fontWeight: '600', color: secondary ? c.primary : c.onPrimary }}>{label}</Text>
    </Pressable>
  );
}
export function Loader({ label = 'Loading' }: { label?: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.loader}>
      <ActivityIndicator color={c.primary} />
      <Text style={{ color: c.textMuted }}>{label}</Text>
    </View>
  );
}
export function Setting({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.setting}>
      <Text>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: c.border, true: c.primary }}
        thumbColor={c.onPrimary}
      />
    </View>
  );
}
