import {
  color,
  control,
  duration,
  easing,
  fontFamily,
  icon,
  radius,
  space,
  typography,
} from './tokens';

const nativeWeight = {
  regular: '400',
  transcript: '400',
  medium: '500',
  semibold: '600',
} as const;

const typeStyle = (
  role: keyof typeof typography,
  fontWeight: (typeof nativeWeight)[keyof typeof nativeWeight],
) => {
  const token = typography[role];

  return {
    fontFamily: fontFamily.native,
    fontSize: token.fontSize,
    lineHeight: Math.round(token.fontSize * token.lineHeight),
    fontWeight,
    letterSpacing: token.fontSize * token.letterSpacing,
  } as const;
};

/** React Native / Expo-ready semantic theme with no React Native dependency. */
export const nativeTheme = {
  colors: {
    background: color.canvas,
    surface: color.surface,
    surfaceSubtle: color.surfaceSubtle,
    surfaceRaised: color.surfaceRaised,
    text: color.ink,
    textMuted: color.muted,
    textFaint: color.faint,
    border: color.line,
    borderStrong: color.lineStrong,
    primary: color.accent,
    primaryPressed: color.accentHover,
    primaryContainer: color.accentSoft,
    onPrimary: color.inverse,
    onPrimaryContainer: color.accentInk,
    success: color.success,
    successContainer: color.successSoft,
    danger: color.danger,
    dangerContainer: color.dangerSoft,
    warning: color.warning,
    warningContainer: color.warningSoft,
    chrome: color.navigation,
    chromeRaised: color.navigationRaised,
    onChrome: color.inverse,
    onChromeMuted: color.inverseMuted,
  },
  typography: {
    caption: typeStyle('caption', nativeWeight.medium),
    ui: typeStyle('ui', nativeWeight.medium),
    body: typeStyle('body', nativeWeight.regular),
    title: typeStyle('title', nativeWeight.semibold),
    subheading: typeStyle('subheading', nativeWeight.semibold),
    heading: typeStyle('heading', nativeWeight.semibold),
    transcript: typeStyle('transcript', nativeWeight.transcript),
    timer: typeStyle('timer', nativeWeight.medium),
  },
  space,
  radius,
  control,
  icon,
  duration,
  easing,
  shadow: {
    action: {
      shadowColor: '#1f2c22',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.22,
      shadowRadius: 1,
      elevation: 1,
    },
    panel: {
      shadowColor: '#1d1f1c',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 3,
    },
    floating: {
      shadowColor: '#121411',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.22,
      shadowRadius: 12,
      elevation: 8,
    },
  },
} as const;

export type FlowNativeTheme = typeof nativeTheme;
