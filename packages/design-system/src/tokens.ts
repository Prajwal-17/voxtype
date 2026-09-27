/**
 * Canonical, platform-neutral VoxType design tokens.
 *
 * Numeric dimensions are density-independent values: CSS adapters convert them
 * to rem/px, while native adapters consume them as points or dp.
 */
export const color = {
  canvas: '#f4f4f1',
  surface: '#fcfcfa',
  surfaceSubtle: '#efefeb',
  surfaceRaised: '#f8f8f5',
  ink: '#22231f',
  muted: '#62645e',
  faint: '#8f928a',
  line: '#dedfd9',
  lineStrong: '#c8cbc3',
  accent: '#464944',
  accentHover: '#353833',
  accentSoft: '#e9eae6',
  accentInk: '#2d302b',
  navigation: '#20221f',
  navigationRaised: '#2b2e2a',
  navigationHover: '#343732',
  navigationLine: '#3c403a',
  inverse: '#f6f6f2',
  inverseMuted: '#b2b6ad',
  success: '#396b50',
  successSoft: '#e7efe9',
  danger: '#93433f',
  dangerSoft: '#f1ece9',
  warning: '#625f43',
  warningSoft: '#efeee5',
  overlay: '#20221f',
  overlayRaised: '#30332f',
  overlayLine: '#42463f',
  overlayText: '#f6f6f2',
  overlayDanger: '#d7d9d3',
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
  heading: { fontSize: 30, lineHeight: 1.15, fontWeight: 620, letterSpacing: -0.02 },
  transcript: { fontSize: 18, lineHeight: 1.72, fontWeight: 450, letterSpacing: -0.01 },
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
  menuItem: 6,
  control: 10,
  panel: 14,
  floating: 16,
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
  compact: 32,
  default: 36,
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
  panel: '0 1px 2px rgb(34 35 31 / 0.03), 0 8px 24px rgb(34 35 31 / 0.04)',
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

export type FlowTokens = typeof tokens;
export type FlowColor = keyof typeof color;
export type FlowTypeRole = keyof typeof typography;
