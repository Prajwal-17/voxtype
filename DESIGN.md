---
name: 'Flow / Studio'
description: 'A calm transcription workspace with a compact recording instrument.'
colors:
  canvas: '#f3f4f5'
  surface: '#ffffff'
  subtle: '#f7f8f9'
  ink: '#25272b'
  muted: '#656970'
  line: '#e2e4e7'
  line-strong: '#cbd0d6'
  accent: '#48483f'
  accent-hover: '#34342e'
  accent-soft: '#eeede7'
  accent-ink: '#393932'
  signal: '#c9bd9c'
  overlay-surface: '#080b09'
  overlay-control: '#414442'
  overlay-wave: '#ffffff'
  overlay-finish-ink: '#151815'
  inverse: '#eeece5'
  inverse-muted: '#b5b2a9'
  graphite: '#1c1c1b'
  graphite-raised: '#2c2c29'
  graphite-line: '#42423d'
  success: '#35705a'
  success-soft: '#eaf3ee'
  danger: '#b1303f'
  danger-soft: '#fbecef'
  warning: '#875d21'
  warning-soft: '#fcf3e3'
typography:
  heading:
    fontFamily: "'DM Sans Variable', 'DM Sans', sans-serif"
    fontSize: '1.875rem'
    fontWeight: 620
    lineHeight: 1.2
    letterSpacing: '-.035em'
  title:
    fontFamily: "'DM Sans Variable', 'DM Sans', sans-serif"
    fontSize: '1rem'
    fontWeight: 620
    lineHeight: 1.4
    letterSpacing: '-.02em'
  body:
    fontFamily: "'DM Sans Variable', 'DM Sans', sans-serif"
    fontSize: '0.875rem'
    lineHeight: 1.65
  ui:
    fontFamily: "'DM Sans Variable', 'DM Sans', sans-serif"
    fontSize: '0.8125rem'
    lineHeight: 1.5
  caption:
    fontFamily: "'DM Sans Variable', 'DM Sans', sans-serif"
    fontSize: '0.75rem'
    lineHeight: 1.5
  button:
    fontFamily: "'DM Sans Variable', 'DM Sans', sans-serif"
    fontSize: '0.8125rem'
    fontWeight: 520
    lineHeight: 1.5
  transcript:
    fontFamily: "'DM Sans Variable', 'DM Sans', sans-serif"
    fontSize: '1.1875rem'
    fontWeight: 440
    lineHeight: 1.85
    letterSpacing: '-.012em'
rounded:
  control: '0.5rem'
  panel: '0.875rem'
  floating: '1.25rem'
  overlay: '18px'
spacing:
  unit: '0.25rem'
  '1.5': '0.375rem'
  '2': '0.5rem'
  '3': '0.75rem'
  '3.5': '0.875rem'
  '4': '1rem'
  '5': '1.25rem'
  '6': '1.5rem'
  '7': '1.75rem'
  '8': '2rem'
  '9': '2.25rem'
  '12': '3rem'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.surface}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '0.5rem 0.875rem'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '0.5rem 0.875rem'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.muted}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '0.5rem 0.875rem'
  button-danger:
    backgroundColor: '{colors.danger}'
    textColor: '{colors.surface}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: '0.5rem 0.875rem'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-secondary-hover:
    backgroundColor: '{colors.subtle}'
  button-ghost-hover:
    backgroundColor: '{colors.subtle}'
    textColor: '{colors.ink}'
  button-sm:
    typography: '{typography.caption}'
    padding: '0.375rem 0.75rem'
  button-lg:
    typography: '{typography.body}'
    padding: '0.625rem 1.25rem'
  field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.ui}'
    rounded: '{rounded.control}'
    padding: '0.5rem 0.75rem'
  navigation:
    backgroundColor: 'transparent'
    textColor: '{colors.inverse-muted}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    height: '2.75rem'
    padding: '0 0.75rem'
  navigation-current:
    backgroundColor: '{colors.graphite-raised}'
    textColor: '{colors.inverse}'
  studio:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.panel}'
  switch:
    backgroundColor: '{colors.line-strong}'
    width: '2.5rem'
    height: '1.5rem'
    padding: '0.125rem'
    rounded: '9999px'
  switch-checked:
    backgroundColor: '{colors.accent}'
  voice-overlay:
    backgroundColor: '{colors.overlay-surface}'
    textColor: '{colors.inverse}'
    rounded: '{rounded.overlay}'
    width: '120px'
    height: '36px'
    padding: '6px'
  session-notice:
    backgroundColor: '{colors.success-soft}'
    textColor: '{colors.success}'
    rounded: '{rounded.control}'
    typography: '{typography.ui}'
    padding: '0.75rem 1rem'
  session-error:
    backgroundColor: '{colors.danger-soft}'
    textColor: '{colors.danger}'
---

# Design System: Flow / Studio

## Overview

**Creative North Star: "The Transcription Studio"**

Flow pairs a quiet writing surface with a compact recording instrument. Cool white surfaces, graphite framing, restrained neutral charcoal actions, and variable DM Sans establish a precise desktop utility. The transcript has the strongest reading hierarchy; controls stay compact and operational.

Motion explains microphone input or processing. Repeated actions respond immediately, and recovery stays discoverable. This system records the approved replacement of the earlier olive workspace.

**Key Characteristics:**

- Cool neutral workspace with graphite navigation.
- Charcoal for primary actions, active capture, and focus.
- Readable transcripts and compact shared controls.
- Actual audio drives the signature waveform.

Extracted from `apps/desktop/src/design-system/tokens.css`, `recipes.ts`, `styles.css`, and the UI, overlay, and waveform components. The approved direction is in `docs/desktop-design.md`; durable behavior constraints are in `PRODUCT.md`. Frontmatter records the implemented semantic primitives. Source review only: no build, tests, app execution, microphone checks, or screenshots were performed for this documentation.

## Colors

### Primary

`accent` is the restrained neutral charcoal action and focus color on light surfaces. `accent-hover` deepens primary hover; `accent-soft` and `accent-ink` support connection guidance and selection. `signal` is the warm champagne used against graphite for audio, selected navigation icons, and overlay controls.

### Neutral

`canvas` frames the workspace; `surface` carries reading and input areas; `subtle` separates the recording station and light hover states. `ink` and `muted` establish reading hierarchy. `line` divides sections; `line-strong` defines controls. `graphite`, `graphite-raised`, and `graphite-line` form the navigation and floating instrument. `inverse` and `inverse-muted` keep those dark surfaces readable.

`success`/`success-soft`, `danger`/`danger-soft`, and `warning`/`warning-soft` express operational status. Pair status color with text or an icon; do not rely on hue alone.

**The Signal Rule.** Charcoal identifies action, focus, or live input; processing remains visually distinct from detected speech.

## Typography

DM Sans Variable, with DM Sans and sans-serif fallbacks, is the shared family. Frontmatter defines the heading, title, body, UI, caption, button, and transcript roles. Medium control weight is 520; semibold headings use 620; transcript reading uses 440. Body and UI retain the normal inherited weight.

Headings are compact and tightly tracked. The transcript uses the largest sustained reading style, generous leading, preserved newlines, and safe wrapping for long words. Interim text uses the muted role. Timers use tabular numerals; their dedicated station treatment is 32px at weight 450 with 1.1 leading. Do not turn this timer treatment into a page heading.

## Layout

The base spacing unit is 4px, with observed half steps for compact control padding. A fixed graphite rail is 12rem wide; the content area is centered within 72rem and ordinarily has 36px horizontal padding. The top bar is 56px high. Settings use a narrower 56rem maximum.

The desktop dictation surface combines a 224px recording station and a flexible transcript column, separated by a border. At 1280px and above the station becomes 248px, content gains 48px top padding, and the editor minimum height rises from 392px to 460px. At 1050px and below the rail becomes 11rem, content padding becomes 28px by 24px, and recording controls move above the transcript. At 700px and below the rail becomes 4rem with icon navigation retaining accessible names, content uses 24px by 16px padding, and settings wrap. The document has a 360px minimum width.

The reference-matched native overlay window is 136 × 52px; its black capsule is 120 × 36px with an 8px margin. Two 24px circular controls flank a 44 × 20px white waveform. Padding and gaps are 6px. The preview uses the identical capsule size. The overlay never steals focus.

## Elevation & Depth

Most workspace surfaces use tone and thin dividers. Reserve the `floating` shadow for the microphone capsule and the `dialog` shadow for dialogs and the overlay preview. Exact values live in the sidecar; the source uses the same low-opacity graphite shadow color for both. Keyboard keycaps use a small 1px lower edge.

The overlay has an opaque black surface and a fine dark outline. Its white waveform sits between the gray cancel circle on the left and the white finish circle with a black tick on the right. The finish button retains its white fill on hover. The preview has no white backing panel. Dedicated overlay tokens keep its colors independent of the light workspace.

## Shapes

Controls share the `control` radius, studio panels and dialogs use `panel`, and floating instruments use `floating`. Switches, small status dots, and overlay action buttons are circular or pill-shaped. Inputs use a stronger thin border; large reading panels use the quiet divider color. Keep transcript and history text un-clipped and selectable.

## Components

### Buttons

The shared typed recipe exposes primary, secondary, ghost, and danger variants, with small, medium, and large sizes. Minimum heights are 32px, 36px, and 44px respectively. Primary uses neutral charcoal, secondary uses a bordered white surface, ghost uses muted text, and danger uses the destructive role with a brightness reduction on hover. Loading buttons are busy and disabled; disabled controls use 45% opacity. Press feedback scales to 0.97. Focus is a 2px outline offset by 4px, using neutral charcoal on light surfaces and signal on graphite.

### Inputs / Fields

Fields use the shared control radius, white fill, strong border, and UI type. Password and search wrappers own their focus-within ring; other fields use a 2px focus-visible outline offset by 2px. Carets use neutral charcoal. Settings controls share this grammar and wrap at narrow widths.

### Navigation

Navigation rows are 44px high with compact UI type. Current rows use raised graphite, inverse text, a signal icon, and a small signal dot. Hover uses raised graphite and inverse text. Selection is immediate; do not animate a sliding navigation indicator. Compact icon-only navigation keeps accessible labels.

### Cards / Containers

The studio is one bordered reading surface with a subtly tinted instrument area. History is a divided document list, with preserved newlines and generous transcript leading. Settings sections use rules and spacing rather than repeated elevated cards. Dialogs use the panel radius, 28px padding, and a width capped at 440px with 20px viewport gutters.

### Switches and Notices

Switches use a 40 × 24px track and a 20px white thumb; checked state translates the thumb 16px and fills the track neutral charcoal. Success and error notices share shape and padding, with semantic foreground/background pairs and recovery actions where applicable. Radix supplies the live switch and dialog behavior; sidecar specimens only illustrate appearance.

### Voice Overlay and Waveform

Visible overlay content is ordered cancel X, centered signal, finish tick. The 24px controls sit at opposite ends of a three-column grid, matching the user’s screenshot. Listening restores the original spring-driven waveform: 13 narrow white bars in the overlay, 37 in the station, and 23 in microphone settings. Actual microphone history advances every 80ms while visible. A square-root visual gain makes quiet speech readable; silence stays at the resting baseline. Springs use stiffness 310, damping 26, and mass 0.65. The station waveform is 104px tall at wide desktop widths and 72px in compact desktop layouts.

Finishing and cleanup use seven short breathing bars in a distinct processing state. Completion uses a check; errors use an alert symbol and provide recovery in the main workspace. The processing cycle is 1600ms with staggered phase offsets. Reduced motion replaces moving history with the current microphone level and holds processing bars still. The discarded canvas drawing, narrow processing sweep, and speech-tinted background are no longer used.

## Do's and Don'ts

### Do:

- Do consume semantic tokens and typed button variants across settings, history, and dictation.
- Do distinguish recording, processing, completed, and error states with accessible names and status text.
- Do preserve selectable transcripts, keyboard focus visibility, reduced-motion support, and recovery actions.
- Do use direct operational labels and concise instructions.

### Don't:

- Don't invent microphone activity, transcripts, or successful completion.
- Don't animate navigation or delay capture for an entrance effect.
- Don't add marketing slogans or decorative generated copy.
- Don't enlarge or focus the native overlay; preserve its constrained footprint.
