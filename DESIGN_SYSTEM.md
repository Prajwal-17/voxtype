# Flow Design System

Flow uses one visual language across desktop and future mobile clients: warm paper surfaces, graphite chrome, Mona Sans typography, and a single low-chroma forest interaction color. The system is quiet, direct, and optimized for capturing and reviewing speech without visual noise.

## Architecture

The canonical implementation lives in `@flow/design-system`.

- `@flow/design-system` exports platform-neutral TypeScript tokens.
- `@flow/design-system/web.css` exposes the tokens as CSS variables and Tailwind v4 theme values.
- `@flow/design-system/native` maps the same roles to React Native/Expo-compatible values.
- Each application owns its rendered components. Desktop uses shadcn-style Radix primitives; mobile must use native controls and navigation conventions.

This boundary is intentional. Visual identity is shared; HTML, hover behavior, platform navigation, gestures, safe areas, sheets, and pickers are not.

## Foundations

### Color

The palette is neutral-first. Warm canvas and paper surfaces establish hierarchy; graphite provides primary text and application chrome. Forest is the only general interaction accent and is reserved for primary actions, focus, selection, links, and live recording cues.

Success, danger, and warning colors communicate outcomes only. Never use them for decoration or ordinary actions. State must always include text or an icon in addition to color.

### Typography

Mona Sans is the product typeface. The shared roles are:

| Role       | Size | Weight | Use                               |
| ---------- | ---: | -----: | --------------------------------- |
| Caption    |   12 |    500 | Metadata, counts, compact notes   |
| UI         |   13 |    500 | Controls, labels, navigation      |
| Body       |   15 |    400 | Explanations and history content  |
| Title      |   17 |    620 | Cards, panels, dialogs            |
| Subheading |   20 |    620 | Empty states and product wordmark |
| Heading    |   30 |    620 | Screen titles                     |
| Transcript |   18 |    450 | Live and completed dictation      |
| Timer      |   40 |    500 | Elapsed recording time only       |

Native clients map 620 to the closest supported semibold face and 450 to the regular transcript face. They must respect Dynamic Type or font scaling rather than fixing text to desktop pixels.

### Spacing and shape

Spacing follows a 4-unit foundation. Prefer 8, 12, 16, 20, 24, 28, and 32 for component and section rhythm. Controls use a 10 radius, panels 14, floating surfaces 16, and menu rows 6. Pills are reserved for compact statuses, switches, and waveform elements.

Desktop controls may use 32 or 36 heights where pointer precision allows it. Touch interfaces must provide at least a 44 by 44 target, even when the visible control is smaller.

### Depth and motion

Flow is flat by default. Borders and tonal surfaces establish structure; shadows are reserved for true layering such as dialogs, menus, sticky action bars, and the recording overlay.

State transitions use 150ms ease-out. Larger layout transitions may use the shared responsive easing up to 220ms. Reduced-motion settings remove nonessential transforms and spatial transitions.

## Component contract

All platform components must support the same semantic states even when their implementation differs:

- Buttons: primary, secondary, outline, ghost, destructive, disabled, and loading.
- Fields: label, optional description, value, placeholder, disabled, validation error, and recovery guidance.
- Statuses: idle, listening, processing, success, warning, and error, each with a textual label.
- Surfaces: canvas, paper panel, subtle group, raised region, floating surface, and protected dialog.
- Empty states: explain what is absent, why it matters, and the direct next action.

Use native switches, select or picker controls, dialogs, and sheets. Do not reproduce desktop controls pixel-for-pixel on mobile.

## Platform rules

### Desktop and web

- Consume `web.css` through Tailwind; do not recreate palette or type values inside an app stylesheet.
- Base interactive components on the project’s shadcn/Radix primitives.
- Preserve keyboard access, visible focus, hover feedback, and compact pointer-oriented density.
- Adapt structure at the shared breakpoints; do not hide core functionality.

### Mobile

- Use safe areas and keyboard insets on every screen.
- Drive phone, tablet, split-screen, and foldable structure from window size classes rather than device names.
- Use bottom tabs or platform navigation on compact widths, and a rail or sidebar only when the available width supports it.
- Replace hover-dependent affordances with visible touch states and clear labels.
- Use a sheet only for short contextual choices; use a full screen for sustained dictation, transcript review, or settings work.
- Keep recording state, elapsed time, cancellation, and recovery reachable with one hand.
- Test font scaling, long localized text, both orientations, and at least one phone and tablet class.

## Accessibility

- Body and placeholder text must meet 4.5:1 contrast; large text must meet 3:1.
- Every action requires an accessible name and every icon-only control requires a label.
- Focus order, screen-reader order, and visual order must agree.
- Never communicate recording, failure, or completion through color alone.
- Respect reduced motion, increased contrast, font scaling, and platform input conventions.
- Destructive actions explain the consequence and preserve recovery where possible.

## Governance

Add a shared token only when the same intent appears across platforms or at least three times in one platform. Add platform-specific values in the adapter, not the core token set. Component APIs describe purpose and state rather than visual trivia.

Changes to `tokens.ts` and `web.css` must remain synchronized; the package test enforces color and typography coverage. App-level design documents may add composition rules, but they cannot redefine shared foundations.
