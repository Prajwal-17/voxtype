/**
 * Canonical, platform-neutral VoxType design tokens.
 *
 * Numeric dimensions are density-independent values: CSS adapters convert them
 * to rem/px, while native adapters consume them as points or dp.
 */
export const color = {
  canvas: '#fbfcfa',
  surface: '#ffffff',
  surfaceSubtle: '#f0f3ef',
  surfaceRaised: '#f3f6f3',
  ink: '#23332d',
  muted: '#606e66',
  faint: '#718478',
  line: '#dde4dd',
  lineStrong: '#bccabc',
  accent: '#275a49',
  accentHover: '#1e493b',
  accentSoft: '#e1ece4',
  accentInk: '#285541',
  navigation: '#f0f3ef',
  navigationRaised: '#e6ebe4',
  navigationHover: '#e1ece4',
  navigationLine: '#dde4dd',
  inverse: '#ffffff',
  inverseMuted: '#c6d6c9',
  success: '#327452',
  successSoft: '#e1ece4',
  danger: '#a43c37',
  dangerSoft: '#f9eeec',
  warning: '#756024',
  warningSoft: '#f6f0de',
  overlay: '#203d33',
  overlayRaised: '#375d4e',
  overlayLine: '#527e63',
  overlayText: '#ffffff',
  overlayWave: '#abd7ad',
  activity0: '#ecf0e8',
  activity1: '#cfdfc7',
  activity2: '#9abe9c',
  activity3: '#558867',
  activity4: '#275a49',
  overlayDanger: '#ffccc5',
} as const;

export const fontFamily = {
  web: "'Mona Sans Variable', 'Mona Sans', 'Segoe UI', sans-serif",
  native: 'MonaSans',
} as const;

export const typography = {
  caption: { fontSize: 12, lineHeight: 1.4, fontWeight: 500, letterSpacing: 0 },
  ui: { fontSize: 13, lineHeight: 1.45, fontWeight: 500, letterSpacing: 0 },
  body: { fontSize: 15, lineHeight: 1.6, fontWeight: 400, letterSpacing: 0 },
  title: { fontSize: 17, lineHeight: 1.35, fontWeight: 620, letterSpacing: -0.02 },
  subheading: { fontSize: 20, lineHeight: 1.3, fontWeight: 620, letterSpacing: -0.018 },
  heading: { fontSize: 26, lineHeight: 1.15, fontWeight: 620, letterSpacing: -0.02 },
  transcript: { fontSize: 16, lineHeight: 1.72, fontWeight: 450, letterSpacing: -0.01 },
  timer: { fontSize: 40, lineHeight: 1, fontWeight: 500, letterSpacing: -0.025 },
} as const;

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const radius = {
  menuItem: 7,
  control: 8,
  panel: 12,
  floating: 999,
  pill: 999,
} as const;

export const duration = {
  instant: 100,
  fast: 150,
  moderate: 220,
} as const;

export const easing = {
  standard: 'ease-out',
  responsive: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

export const control = {
  compact: 40,
  default: 44,
  large: 44,
  minimumTouchTarget: 44,
  comfortableTouchTarget: 48,
} as const;

export const icon = {
  small: 14,
  default: 16,
  large: 20,
  navigation: 24,
} as const;

export const breakpoint = {
  narrow: 768,
  workspaceStack: 960,
  navigationCompact: 1024,
} as const;

export const shadow = {
  action: '0 1px 2px rgb(34 35 31 / 0.22)',
  control: '0 1px 1px rgb(34 35 31 / 0.05)',
  panel: 'none',
  floating: '0 8px 24px rgb(18 20 17 / 0.22)',
  dialog: '0 24px 80px rgb(18 20 17 / 0.18)',
} as const;

export const tokens = {
  color,
  fontFamily,
  typography,
  space,
  radius,
  duration,
  easing,
  control,
  icon,
  breakpoint,
  shadow,
} as const;

export type VoxTypeTokens = typeof tokens;
export type VoxTypeColor = keyof typeof color;
export type VoxTypeTypeRole = keyof typeof typography;

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
    onChrome: color.ink,
    onChromeMuted: color.muted,
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
      shadowColor: '#22231f',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.22,
      shadowRadius: 1,
      elevation: 1,
    },
    panel: {
      shadowColor: '#22231f',
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

export type VoxTypeNativeTheme = typeof nativeTheme;
