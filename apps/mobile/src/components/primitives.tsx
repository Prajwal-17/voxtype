import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
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
  const weight = Number(StyleSheet.flatten(style)?.fontWeight ?? 400);
  const fontFamily =
    weight >= 600 ? 'MonaSansSemiBold' : weight >= 500 ? 'MonaSansMedium' : 'MonaSansRegular';
  return (
    <NativeText {...props} style={[styles.text, style, { fontFamily, fontWeight: 'normal' }]} />
  );
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
        pressed && { opacity: 0.7 },
      ]}
    >
      {icon}
      <Text
        style={{
          fontWeight: '600',
          fontSize: 14,
          lineHeight: 20,
          color: secondary ? c.primary : c.onPrimary,
          flexShrink: 1,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
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
      <Text style={{ flexShrink: 1 }}>{label}</Text>
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

export function IconButton({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 48,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 24,
        opacity: disabled ? 0.4 : 1,
        backgroundColor: pressed ? c.surfaceSubtle : 'transparent',
      })}
    >
      {children}
    </Pressable>
  );
}

export function SettingLink({
  label,
  detail,
  onPress,
  disabled,
  destructive,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: 52,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: disabled ? 0.4 : 1,
        backgroundColor: pressed ? c.surfaceSubtle : 'transparent',
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: destructive ? c.danger : c.text }}>{label}</Text>
        {!!detail && <Text style={styles.muted}>{detail}</Text>}
      </View>
      <CaretRightIcon size={16} color={c.textMuted} />
    </Pressable>
  );
}
