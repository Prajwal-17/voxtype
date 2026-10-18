---
name: VoxType Android
description: Compact, quiet recording and transcript reading with forest green accents.
colors:
  primary: '#275a49'
  primary-container: '#e1ece4'
  on-primary: '#ffffff'
  canvas: '#fbfcfa'
  surface: '#ffffff'
  surface-subtle: '#f0f3ef'
  text: '#23332d'
  text-muted: '#606e66'
  border: '#dde4dd'
  danger: '#a43c37'
  scrim: '#00000055'
typography:
  heading:
    fontFamily: 'MonaSansSemiBold'
    fontSize: '22sp'
    fontWeight: 600
    lineHeight: '30sp'
    letterSpacing: '-0.4sp'
  title:
    fontFamily: 'MonaSansSemiBold'
    fontSize: '18sp'
    fontWeight: 600
    lineHeight: '26sp'
  body:
    fontFamily: 'MonaSansRegular'
    fontSize: '15sp'
    fontWeight: 400
    lineHeight: '22sp'
  reader:
    fontFamily: 'MonaSansRegular'
    fontSize: '17sp'
    fontWeight: 400
    lineHeight: '28sp'
  muted:
    fontFamily: 'MonaSansRegular'
    fontSize: '13sp'
    fontWeight: 400
    lineHeight: '20sp'
  action:
    fontFamily: 'MonaSansSemiBold'
    fontSize: '14sp'
    fontWeight: 600
    lineHeight: '20sp'
  navigation:
    fontFamily: 'MonaSansMedium'
    fontSize: '12sp'
    fontWeight: 500
    lineHeight: '18sp'
rounded:
  segment: '7dp'
  action: '10dp'
  panel: '12dp'
  sheet-top: '20dp'
  icon-button: '24dp'
  avatar: '999dp'
spacing:
  xs: '4dp'
  sm: '8dp'
  md: '12dp'
  lg: '16dp'
  xl: '20dp'
  xxl: '24dp'
  reader-end: '32dp'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.action}'
    rounded: '{rounded.action}'
    padding: '10dp 14dp'
  button-secondary:
    backgroundColor: 'transparent'
    textColor: '{colors.primary}'
    typography: '{typography.action}'
    rounded: '{rounded.action}'
    padding: '8dp'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.panel}'
    padding: '{spacing.lg}'
  search:
    backgroundColor: '{colors.surface-subtle}'
    textColor: '{colors.text}'
    rounded: '{rounded.panel}'
  dictionary-field:
    backgroundColor: '{colors.surface-subtle}'
    textColor: '{colors.text}'
    rounded: '{rounded.action}'
    padding: '10dp 12dp'
  dictionary-chip:
    backgroundColor: '{colors.primary-container}'
    textColor: '{colors.primary}'
    rounded: '{rounded.icon-button}'
  navigation:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text-muted}'
    typography: '{typography.navigation}'
  filter-tab:
    backgroundColor: 'transparent'
    textColor: '{colors.primary}'
  segment:
    backgroundColor: '{colors.surface-subtle}'
    rounded: '{rounded.action}'
    padding: '3dp'
  setting-link:
    backgroundColor: 'transparent'
    textColor: '{colors.text}'
    typography: '{typography.body}'
    padding: '10dp 0'
  recording-player:
    backgroundColor: '{colors.surface-subtle}'
    rounded: '{rounded.panel}'
    padding: '{spacing.md}'
---

# Design System: VoxType Android

## Overview

**Creative North Star: "Compact and quiet"**

VoxType uses forest green, Mona Sans, white groups and a softly tinted canvas for a compact Android utility. Text and recording state carry the hierarchy; secondary actions stay visually quiet. This records the user's confirmed direction without introducing a new identity metaphor.

The application inherits its palette from `packages/shared/theme.ts`; mobile component styles determine the type sizes, spacing and controls recorded here. This document covers the React Native application, not the desktop interface or native voice-bubble geometry. It records implemented source behavior; native visual and playback verification is not established by this document.

**Key Characteristics:**

- Forest green accents on light neutral surfaces.
- Compact typography with generous touch targets.
- Flat groups, restrained dividers and contextual action sheets.
- Selectable transcript reading with a persistent playback strip.

## Colors

The palette pairs a muted forest green with warm, lightly green-tinted neutrals. Frontmatter values are normative and come from the shared native theme, except the sheet scrim defined in `sheet.tsx`.

### Primary

- **Forest green** (`primary`) marks primary actions, selected filters, active navigation and playback controls.
- **Soft green** (`primary-container`) supports the active recording banner.
- **White on green** (`on-primary`) labels filled actions and colors native switch thumbs.

### Neutral

- **Quiet canvas** (`canvas`) sits behind the application.
- **White surface** (`surface`) supports grouped settings, sheets and bottom navigation.
- **Subtle green gray** (`surface-subtle`) defines search, playback and segmented-control backgrounds.
- **Deep ink** (`text`) carries content; **muted ink** (`text-muted`) carries metadata and supporting labels.
- **Soft divider** (`border`) separates transcript rows and selected settings groups.
- **Muted red** (`danger`) identifies failures and destructive action labels; it is semantic feedback, not a secondary brand accent.
- **Translucent black** (`scrim`) dims the application behind a bottom sheet.

The app explicitly uses the light color scheme. No dark variant is implemented here.

**The Quiet Accent Rule.** Use green for actions and selected state while keeping reading surfaces neutral.

## Typography

**Body and interface font:** Mona Sans, loaded from bundled Regular, Medium and SemiBold font files. The `Text` primitive selects the correct file from the requested weight and resets native synthetic weight to normal. No separate display font is introduced.

### Hierarchy

- **Heading:** compact app-bar titles use `heading`.
- **Title:** sheet headings, empty states and section titles use `title`.
- **Body:** normal content and setting labels use `body`; list previews use the same size with a slightly looser line height (23sp).
- **Reader:** selectable transcript text uses `reader`.
- **Muted:** supporting labels and metadata use `muted`; transcript row metadata reduces to 12sp while retaining its line height.
- **Action:** primary and secondary text actions use `action`.
- **Navigation:** tab labels use `navigation` beneath Phosphor icons.

Playback elapsed and total time use tabular numerals. Search and the single-line dictionary field use the body font size; dictionary chips use the body text style. The mobile type ramp above records actual component overrides rather than the shared desktop heading scale.

## Layout

Screen content follows a single vertical column. The app bar uses horizontal padding (16dp), vertical padding (8dp), safe-area top insets and flexible title space. Standard scrolling content uses horizontal padding (16dp), bottom padding (28dp) and group gaps (16dp). Transcript search, rows and reader use horizontal padding (20dp).

Actions and icon controls have minimum touch dimensions (48dp). Setting rows have minimum height (52dp) and grow with content. Compact text does not reduce these targets. The analytics heatmap provides separate previous-day, next-day and today controls for precise day selection.

Bottom navigation starts at 64dp plus the bottom safe-area inset and adds `max(0, (fontScale - 1) × 18)` for larger system text. Tabs have minimum height (52dp). Bottom sheets fill available width up to 600dp, cap their height at 85%, and include bottom safe-area padding. There are no application-specific breakpoint tokens in the native shell.

## Elevation & Depth

Ordinary cards and groups have no default border or shadow. Surface tone, spacing and selective dividers establish hierarchy. The transient message surface adds a thin border and Android elevation (3); sheets use a scrim rather than a custom shadow. Do not infer the shared desktop shadow vocabulary as an applied mobile rule.

**The Flat Group Rule.** Group settings with surface tone and spacing; add separators where the implemented relationship needs them.

## Shapes

Panels, search and the playback strip share softly rounded corners. Filled actions are slightly tighter, while icon controls are circular. Bottom sheets round their upper corners only. Filter tabs use an underline instead of a pill; analytics segments use compact rounded selected surfaces. Inputs may use borders, and transcript rows use dividers, so borderless cards are not a blanket ban on lines.

## Components

### Buttons

Filled primary actions pair forest green with white semibold labels. Secondary actions have transparent backgrounds, green labels and intrinsic width. Both retain minimum touch dimensions (48dp), reduce opacity when pressed (0.7) and when disabled (0.45).

Icon buttons use minimum dimensions (48dp), an explicit accessible label, a subtle pressed background and disabled opacity (0.4). Phosphor icons are imported components; navigation uses filled icons for the current tab and regular icons otherwise. Native hover and focus styling are not customized by these primitives.

### Cards / Containers

The common card has a white background, panel corners and padding from the frontmatter. It has no default stroke or elevation. Settings use a few grouped cards with sentence-case section labels and selective internal separators.

### Inputs / Fields

Search sits in a subtle surface with a leading search icon and a conditional clear control. Its input has minimum height (48dp). Dictionary entry uses a single-line “Add a word or phrase” field on a subtle surface, with minimum height (48dp) and an adjacent plus icon action (48dp). Submitting from the keyboard also adds the term. Native input focus behavior is inherited; no custom focus-color transition is implemented.

### Dictionary chips

Saved words and phrases appear as individually removable chips in a wrapping row with gaps (8dp). Each chip pairs a soft green background with green body text, rounded corners (24dp), left padding (14dp) and a labeled remove control (48dp). Single-line labels truncate within the available width so the remove control stays visible, including at narrow phone widths. Each add or remove saves to the account backend immediately; the term count shows a saving state while controls are locked. Case-insensitive duplicates and limits of 100 terms and 100 characters per term produce inline feedback. The dictionary does not use a bulk editor or a separate save action. Copy explains that words sync across desktop and mobile, including the voice bubble. Sync failures appear inline while the account cache remains visible; failed additions keep the input so they can be retried.

### Navigation and filters

The four bottom tabs are Home, Transcripts, Insights and Settings. Green indicates the active destination and muted ink indicates others. Account access is a circular app-bar control. Deeper preference pages use a back control.

Transcript filters are text tabs with a selected underline (2dp) and minimum height (48dp). Analytics segments use a subtle container and a white selected segment; segments wrap when needed. Settings links use a trailing chevron, a flexible label, optional supporting detail and minimum height (52dp).

### Contextual sheets

Occasional transcript, recording and recovery actions open in bottom sheets. Sheets include a title, an accessible close control, a dismissible backdrop and scrollable content. Their modal transition is instant. The reader modal also opens without animation, and the app configures system reduced-motion support.

### Transcript reader and playback

Transcript rows show three-line previews and open a dedicated reader. There are no expand/collapse controls. The reader keeps the audio strip outside the transcript text scroller and keys its player by recording identity. The text remains selectable.

Playback exposes play/pause, restart, a progress bar, elapsed/total time, loading or buffering state, and failure copy with retry. It pauses when the app backgrounds or recording becomes active. Missing local audio gets a direct explanation. These are implemented behaviors, not a claim that device playback QA has passed.

Background transcript refresh retains existing rows; refresh failures show a compact footer with retry. A loader is used for an empty initial list. Success feedback uses a transient dismissible message rather than a permanent content banner.

The sidecar contains HTML/CSS translations for design-panel previews of native components. Browser hover/focus treatments and generated tonal ramps in that sidecar are preview aids, not additional implemented Android tokens or proof of native rendering.

## Do's and Don'ts

### Do:

- **Do** preserve the forest green accent and bundled Mona Sans fonts.
- **Do** keep compact text paired with at least 48dp action targets and 52dp setting rows.
- **Do** retain visible transcript content during background refresh.
- **Do** keep playback outside the reader text scroller and expose its state and failures.
- **Do** use contextual sheets for occasional actions and account for safe-area insets.

### Don't:

- **Don't** add expand/collapse controls to transcript previews or the reader.
- **Don't** promote every secondary action into a prominent filled button.
- **Don't** add default borders and shadows to all cards.
- **Don't** substitute shared desktop type dimensions for the mobile component styles.
- **Don't** treat browser previews or this source inventory as completed native QA.
