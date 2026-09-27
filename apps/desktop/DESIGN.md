---
name: Flow Desktop
description: A calm, precise desktop workspace for fast, recoverable dictation.
colors:
  canvas: "#f4f4f1"
  surface: "#fcfcfa"
  surface-subtle: "#efefeb"
  surface-raised: "#f8f8f5"
  ink: "#22231f"
  muted: "#62645e"
  faint: "#8f928a"
  line: "#dedfd9"
  line-strong: "#c8cbc3"
  accent: "#464944"
  accent-hover: "#353833"
  accent-soft: "#e9eae6"
  accent-ink: "#2d302b"
  navigation: "#20221f"
  navigation-raised: "#2b2e2a"
  navigation-hover: "#343732"
  navigation-line: "#3c403a"
  inverse: "#f6f6f2"
  inverse-muted: "#b2b6ad"
  success: "#396b50"
  success-soft: "#e7efe9"
  danger: "#93433f"
  danger-soft: "#f1ece9"
  warning: "#625f43"
  warning-soft: "#efeee5"
  overlay: "#20221f"
  overlay-raised: "#30332f"
  overlay-line: "#42463f"
  overlay-text: "#f6f6f2"
  overlay-danger: "#d7d9d3"
typography:
  heading:
    fontFamily: "Mona Sans Variable, Mona Sans, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 620
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  subheading:
    fontFamily: "Mona Sans Variable, Mona Sans, Segoe UI, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 620
    lineHeight: 1.3
    letterSpacing: "-0.018em"
  title:
    fontFamily: "Mona Sans Variable, Mona Sans, Segoe UI, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 620
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Mona Sans Variable, Mona Sans, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  ui:
    fontFamily: "Mona Sans Variable, Mona Sans, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "normal"
  caption:
    fontFamily: "Mona Sans Variable, Mona Sans, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  transcript:
    fontFamily: "Mona Sans Variable, Mona Sans, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 450
    lineHeight: 1.72
    letterSpacing: "-0.01em"
  timer:
    fontFamily: "Mona Sans Variable, Mona Sans, Segoe UI, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.025em"
rounded:
  menu-item: "6px"
  control: "0.625rem"
  panel: "0.875rem"
  floating: "1rem"
  pill: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
  "2xl": "1.75rem"
  "3xl": "2rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.875rem"
    height: "2.25rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.875rem"
    height: "2.25rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.875rem"
    height: "2.25rem"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "1.25rem"
  select-trigger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0.5rem 2rem 0.5rem 0.75rem"
    width: "12rem"
  status-badge:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.625rem"
  sidebar-item-active:
    backgroundColor: "{colors.navigation-raised}"
    textColor: "{colors.inverse}"
    typography: "{typography.ui}"
    rounded: "{rounded.control}"
    padding: "0 0.75rem"
    height: "2.5rem"
---

# Design System: Flow Desktop

> The project-wide foundations live in [`../../DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md) and `@flow/design-system`. This document defines the desktop composition and component adapter; it must not redefine the shared tokens.

## Overview

**Creative North Star: "The Quiet Control Room"**

Flow is a conventional premium desktop productivity workspace, played straight. Its warm paper canvas and deep graphite navigation frame a focused working area; a mineral graphite accent identifies interaction and recording state without turning the interface into a brand spectacle. The result should feel calm, capable, and immediately legible during a time-sensitive task.

Hierarchy comes from compact Mona Sans typography, measured spacing, explicit state language, and consistent surface boundaries. Most UI remains visually quiet so the live transcript, waveform, timer, and primary recording action can carry the user's attention. Behavior stays familiar: controls are compact, states are named, and recoverability is always visible.

**Key Characteristics:**

- Warm paper application canvas with softly off-white working surfaces.
- Deep graphite sidebar that anchors the desktop workspace.
- One mineral graphite interaction tone, used sparingly and consistently.
- Compact Radix/shadcn-style controls with visible focus and direct state labels.
- Restrained borders and elevation; no gradients, glass, or oversized decoration.
- Transcript-first working area with a dedicated recorder panel.

## Colors

The palette is warm-neutral and low-noise, with mineral graphite reserved for primary action, focus, selection, and live recording cues.

### Primary

- **Mineral Graphite:** The primary action and focus tone; it marks recording controls, selected states, live indicators, links, and waveform activity.
- **Pressed Graphite:** The deliberate hover state for primary actions and links.
- **Mineral Wash:** A quiet state background for setup prompts, selections, and active badges.
- **Mineral Ink:** Dark accent text on pale mineral surfaces.

### Secondary

- **Confirmation Green:** Successful, secure, and completed states, paired with a pale green wash.
- **Muted Brick:** Destructive actions and interruption states, paired with a warm pale wash.
- **Quiet Olive:** Desktop warnings and browser-preview limitations, paired with a pale olive wash.

### Neutral

- **Warm Canvas:** The application background; it separates the workspace from paper panels without visible decoration.
- **Paper Surface:** Cards, fields, dialogs, and working areas.
- **Subtle Surface:** Hover fills, grouped settings, inactive badges, and low-emphasis regions.
- **Raised Surface:** Table headers, transcript footers, and inset field backgrounds.
- **Warm Ink:** Primary copy.
- **Operational Gray:** Secondary copy and icons.
- **Faint Gray:** Tertiary icons and inactive status dots.
- **Hairline / Strong Hairline:** Standard dividers and the stronger control boundary.
- **Navigation Graphite:** The sidebar, tooltip, and recording-overlay ground, supported by raised, hover, and divider variants.
- **Inverse Paper / Muted Inverse:** Primary and secondary content on dark navigation.

**The One Signal Rule.** Mineral graphite is the only general interaction accent. Semantic success, danger, and warning tones communicate outcomes; they do not compete for ordinary actions.

**The Quiet Canvas Rule.** Use the warm canvas behind paper surfaces. Do not add gradients, decorative color fields, or translucent glass.

## Typography

**Display Font:** Mona Sans Variable (with Mona Sans, Segoe UI, and sans-serif fallbacks)

**Body Font:** Mona Sans Variable (with Mona Sans, Segoe UI, and sans-serif fallbacks)
**Label Font:** Mona Sans Variable (with Mona Sans, Segoe UI, and sans-serif fallbacks)

**Character:** A single variable grotesk keeps the utility cohesive and familiar. Slightly tightened headings and numeric displays add precision; body and transcript copy remain open and highly readable.

### Hierarchy

- **Heading** (620, 1.875rem, 1.15): Page titles and blocking load states.
- **Subheading** (620, 1.25rem, 1.3): Transcript empty-state guidance and the product wordmark.
- **Title** (620, 1.0625rem, 1.35): Panel, section, dialog, and empty-state headings.
- **Body** (400, 0.9375rem, 1.6): Descriptions, explanatory copy, and history text.
- **UI** (500, 0.8125rem, 1.45): Controls, field labels, navigation, and compact operational text.
- **Caption** (500, 0.75rem, 1.4): Metadata, supporting notes, counts, and status labels.
- **Transcript** (450, 1.125rem, 1.72): Live and finished dictation text; its generous leading supports sustained reading.
- **Timer** (500, 2.5rem, 1): Tabular recording time with tight tracking.

**The Working Type Rule.** Reserve the timer scale for elapsed time and the transcript scale for dictated content. Ordinary interface copy stays compact.

**The Explicit State Rule.** Never rely on color alone. Persistent application states retain a concise text label; the compact voice overlay may use distinct shape and motion when the same state is announced explicitly to assistive technology.

## Layout

The desktop shell uses a fixed 240px navigation sidebar and a 64px sticky application header. At widths below 1024px, the sidebar collapses to an 80px icon rail while the main workspace preserves its structure. The content canvas is centered at a maximum width of 1240px with 32px desktop gutters and 20px compact gutters; the application enforces a 360px minimum width.

The Dictation workspace is a two-column grid: a flexible transcript canvas on the left and a 304px recorder panel on the right, separated by a 20px gap. At and below 960px the panels stack into one compact column, the transcript minimum height reduces from 520px to 420px, and recorder vertical space contracts. Page headers and settings field rows wrap below 768px, with field controls expanding to the available width.

Spacing follows a dense 4px foundation. Repeated component gaps and padding use 8px, 12px, 16px, 20px, 28px, and 32px steps. Large whitespace exists to focus the live transcript and recorder, not to create decorative emptiness.

**The Transcript-First Rule.** At normal desktop sizes, the transcript owns the flexible column and the recorder remains a stable 304px tool panel.

**The Compact Stack Rule.** Below 960px, preserve full function by stacking the same panels; do not introduce a separate mobile navigation model or hide recording state.

## Elevation & Depth

Flow is flat by default. Borders, subtle tonal changes, and adjacency establish most hierarchy; elevation is reserved for surfaces that genuinely float or stay above moving content.

### Shadow Vocabulary

- **Action:** `0 1px 2px rgb(34 35 31 / 0.22)` — compact depth beneath primary graphite actions.
- **Control:** `0 1px 1px rgb(34 35 31 / 0.05)` — minimal lift beneath secondary buttons.
- **Panel:** `0 1px 2px rgb(34 35 31 / 0.03), 0 8px 24px rgb(34 35 31 / 0.04)` — sticky save bars and restrained lifted panels.
- **Floating:** `0 8px 24px rgb(18 20 17 / 0.22)` — the voice overlay, menus, tooltips, and overlay preview.
- **Dialog:** `0 24px 80px rgb(18 20 17 / 0.18)` — modal and confirmation surfaces above a graphite scrim.
- **Keyboard Key:** A flat muted surface with compact type, following the shadcn `Kbd` primitive; shortcut labels never fall back to ad hoc borders or plain text.

**The Flat-by-Default Rule.** Cards and settings sections use a border without a shadow. Apply elevation only when layering, stickiness, or detached placement requires it.

## Shapes

Flow uses gently rounded geometry without soft, playful inflation. Controls use a 10px radius, panels use 14px, and detached floating chrome uses 16px. Menu rows tighten to 6px; badges, switches, status dots, waveform bars, and small overlay controls use full pills or circles. The logo mark uses a deliberate 9px corner between control and panel scale.

Borders are one-pixel warm-gray hairlines. Strong hairlines belong to interactive field boundaries; standard hairlines define cards, dividers, and grouped regions. Panels clip content only when their internal header, body, and footer tones need a clean shared silhouette.

**The Contained Curve Rule.** Radius communicates component scale, not decoration: 10px for controls, 14px for panels, 16px for detached floating surfaces.

## Components

### Buttons

- **Shape:** Compact gently rounded controls (10px) with 32px, 36px, or 44px height depending on density.
- **Primary:** Mineral Graphite with inverse paper text, a subtle one-pixel action shadow, and 14px horizontal padding at the default size.
- **Hover / Focus:** Hover darkens to Pressed Graphite; keyboard focus is a two-pixel Mineral Graphite outline with a two-pixel offset. Press scales to 98%; reduced-motion users receive no transform.
- **Secondary / Outline:** Paper Surface with Deep Ink, a quiet shadow or strong hairline, and a Subtle Surface hover.
- **Ghost:** Transparent Operational Gray text, becoming Deep Ink on a Subtle Surface hover.
- **Destructive:** Muted Brick with white text; use only for irreversible actions.
- **Disabled / Loading:** Controls retain geometry, use 45% opacity, and loading actions replace certainty with a spinning status glyph.

### Chips

- **Style:** Full-pill status badges use Caption typography, compact 4px by 10px padding, and either a Subtle Surface or a pale semantic wash.
- **State:** Every badge pairs its color with text and, where useful, a status dot or icon. Active recording uses Mineral Wash and Mineral Ink.

### Cards / Containers

- **Corner Style:** Panel radius (14px).
- **Background:** Paper Surface on Warm Canvas; Raised Surface is limited to headers, footers, or grouped supporting regions.
- **Shadow Strategy:** Flat at rest; see the Flat-by-Default Rule.
- **Border:** One-pixel Hairline.
- **Internal Padding:** Usually 20px; large transcript reading space uses 28px on desktop and 20px in compact layouts.

### Inputs / Fields

- **Style:** Paper or Raised Surface, strong hairline, 10px radius, UI typography, and compact internal spacing. Bare inputs may sit inside a bordered compound field.
- **Focus:** A two-pixel Mineral Graphite outline with a two-pixel offset, applied to the complete compound field when appropriate.
- **Error / Disabled:** Error copy uses Muted Brick and explicit text. Disabled controls use 45% opacity and a not-allowed cursor.

### Navigation

The sidebar uses Navigation Graphite with 40px rows, 10px corners, compact UI typography, and 12px horizontal padding. Active and hovered items use the raised navigation tone; active items use inverse text and a small mineral dot. Below 1024px, labels collapse and tooltips preserve discoverability.

### Switches

The 40px by 24px switch uses a strong hairline fill when off, Mineral Graphite when on, and a 20px paper thumb. It shares the standard focus outline and 150ms state transition.

### Voice Overlay

The system-wide overlay uses a compact 288px by 56px transparent window with a fully rounded 272px by 40px capsule, centered 12px above the active monitor work-area edge. Overlay Graphite, a quiet outline, and the floating shadow separate it from the working app without reading as a rectangular panel. Four-pixel internal padding places each 32px circular control close to the capsule edge while the center is given to a 190px by 32px waveform with 23 thick spring-driven bars. There is no visible status copy. Finishing and cleaning both replace the waveform with one standard 20px loading spinner. Screen-reader status remains explicit, and reduced motion leaves the loading symbol static.

## Do's and Don'ts

### Do:

- **Do** keep the transcript visually dominant and the recorder action unambiguous.
- **Do** reuse the centralized `--palette-*` values exposed through Tailwind theme aliases.
- **Do** combine text, iconography, shape, motion, and semantic color according to the surface; the textless voice overlay must keep explicit screen-reader announcements.
- **Do** preserve visible keyboard focus, semantic controls, status announcements, and reduced-motion behavior.
- **Do** use borders and tonal layering before reaching for elevation.
- **Do** keep controls compact and align them to the 4px spacing foundation.

### Don't:

- **Don't** add gradients, glass effects, oversized decoration, or novelty metaphors.
- **Don't** introduce another general-purpose accent color alongside Mineral Graphite.
- **Don't** shadow ordinary cards or settings sections.
- **Don't** hide critical recording state behind icon-only communication.
- **Don't** replace the 960px stacked workspace with a diminished mobile-only experience.
- **Don't** turn transcript, history, settings, or overlay behavior into decorative UI at the expense of recovery and control.
