# Desktop design trial

Four exploratory directions are available in the floating **Design lab**. These are candidates for selection, not a new shared/mobile standard. Run `pnpm dev:web` and open `http://localhost:1420` (or run `pnpm dev:desktop` for native recording).

| Design         | Palette                    | Layout and type                                                               | Direct preview    |
| -------------- | -------------------------- | ----------------------------------------------------------------------------- | ----------------- |
| 01 Studio      | Charcoal, moss, lime       | Anchored sidebar, sans-serif display type, circular recorder                  | `/?design=studio` |
| 02 Field Notes | Parchment, pine            | Sidebar, serif headings, ruled writing surface, flat recorder                 | `/?design=field`  |
| 03 Signal      | Midnight, electric blue    | Collapsible sidebar, recorder on the left, squared panels, monospace metadata | `/?design=signal` |
| 04 Tide        | Mineral, petrol, sea glass | Collapsible sidebar, centered serif title, horizontal recorder                | `/?design=clay`   |

Tide keeps the original Clay layout with a cool mineral-gray canvas, petrol actions, and sea-glass recorder. The `clay` URL/storage id is retained so existing saved selections still work.

The desktop now uses a persistent shadcn-based sidebar across all four directions, with Phosphor icons. It expands to 248px and collapses to an 80px rail; Ctrl/Cmd+B also toggles it outside editable fields. The implementation has `components.json`, Vite/TypeScript aliases, and standard shadcn color aliases pointing to the existing palette. Earlier review entries below describe the initial exploration; the sidebar/icon refinement at the end records the current implementation.

The selector supports keyboard activation, selected-state announcements, collapse/expand, and local persistence. Changing design preserves page state, settings drafts, and the recording session. A valid `design` query parameter overrides the saved initial choice. Native commands and authentication remain the existing implementations. Browser recording remains disabled.

Implementation uses the existing React, Tailwind, and CSS-variable styling system. Trial tokens live in `src/design-trial.css`, scoped by `html[data-design]`; they also reach portal-based settings controls. Shared design-system and mobile files are unchanged. The native voice-overlay window does not mount the lab. Remove the trial wrapper and stylesheet when the chosen direction becomes the standard.

## Full polish review

Scope: desktop workspace shell, four dictation directions, selector, and shared desktop buttons. History empty state and settings controls received integration checks. Native recording, mobile, and a complete secondary-page redesign are outside this trial review.

| Category    | Evidence inspected                                         | Result                                                                                             |
| ----------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Typography  | Four browser layouts, heading styles, transcript and timer | Distinct hierarchy; balanced headings, pretty descriptions, tabular timer                          |
| Surfaces    | Panels, selector, navigation, settings menu and save bar   | Geometry varies by design; selector uses concentric 20/12px corners with 8px inset                 |
| Animations  | Button/selector CSS, idle/live/cleaning states             | Explicit transitions; no layout entrance animations; reduced-motion rules retained                 |
| Icons       | Sidebar, recorder, selection indicator                     | Current-color icons; active nav no longer forces white; compact rail exposes labels on hover/focus |
| Performance | Build and stylesheet                                       | No dependency added; transitions name specific properties; no new will-change hints                |

Resolved findings and implementation changes:

| Severity | Location                                                             | Before                                                   | After                                                                                            | Why                                                               |
| -------- | -------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| MEDIUM   | `src/App.tsx:294`, `src/design-trial.css:2`, `src/styles.css:3`      | Single pale workspace with little variation in hierarchy | Four palettes, type treatments, panel geometries, recorder positions and navigation arrangements | Typography and surfaces establish distinct, reviewable directions |
| MEDIUM   | `src/components/design-switcher.tsx:6`, `src/lib/design-trial.ts:43` | No comparison mechanism                                  | Numbered, labeled, keyboard-operable design selector with persisted selection                    | Explicit state cues preserve orientation while comparing          |
| MEDIUM   | `src/components/ui/button.tsx:23`                                    | 28–36px small/icon targets                               | Minimum 40px desktop button targets                                                              | Minimum hit area improves reliable interaction                    |
| LOW      | `src/components/ui/button.tsx:46`                                    | 0.98 press scale with no opt-out                         | 0.96 press scale, static opt-out, existing reduced-motion handling                               | Consistent tactile feedback with motion restraint                 |
| MEDIUM   | `src/components/layout.tsx:44`                                       | Active icon forced white                                 | Icon inherits navigation color, 2px stroke                                                       | Current-color state remains readable in light and dark palettes   |
| MEDIUM   | `src/pages/Settings.tsx:260`, `src/App.tsx:238`                      | Floating components share bottom space                   | Settings save bar and voice preview clear the lab                                                | Layered controls stay reachable                                   |
| LOW      | `src/App.tsx:386`                                                    | Flat inactive waveform used in the recording area        | Quiet microphone icon at rest; real waveform while active                                        | Static state communicates idle without fabricating audio activity |
| LOW      | `src/App.tsx:451`                                                    | Blank space below the workspace                          | Three short workflow hints                                                                       | Gives the first-use empty state useful guidance                   |

Considered but rejected:

| Location                    | Candidate                                  | Rejected because                                                |
| --------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| Shared design-system tokens | Put all palettes in the shared package     | Would couple an unselected desktop experiment to mobile         |
| Dictation component         | Four independent copies of recording logic | Would risk inconsistent behavior and discard state on switching |
| Recorder                    | Animate decorative audio bars at rest      | Would imply microphone activity that is not occurring           |

Verification:

- `pnpm --filter @voxtype/desktop check-types` — passed.
- `pnpm --filter @voxtype/desktop exec eslint src --max-warnings 0` — passed.
- `pnpm --filter @voxtype/desktop build` — passed; Vite reports a large chunk and third-party Zod annotation warnings.
- Browser: selected all four designs, inspected their layouts, confirmed one pressed selection, distinct panel radii, and no horizontal overflow at the attached desktop viewport.
- Browser: switching all four directions preserved an injected test session, transcript, and timer; simulated cleaning exposed a busy control and error exposed an alert. Test data was restored and the page reloaded.
- Browser: selection persisted after reload; History empty state and Settings language portal opened; collapse/expand worked. Tab focus showed a visible 2px outline and Enter selected Field Notes.
- Source: reduced-motion handling, explicit transition properties, and minimum button targets checked.
- **Not verified:** native microphone capture/paste, complete hover/pressed motion replay at 10% speed, reduced-motion browser emulation, and alternate desktop viewport sizes. The collaborative preview's resize calls timed out, and the slow-motion capture was not reliable; these are not claimed as passing.

Verdict: **Approve for the desktop design trial**; no known actionable polish findings remain in the inspected scope. The unverified native, motion, and viewport checks above remain required before standardizing a direction.

## Tide palette revision

Full review scoped to the selected Clay layout's desktop palette, using the existing Tailwind/CSS variables. Its geometry and recording behavior are retained.

| Category    | Evidence inspected                                          | Result                                                             |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Typography  | Browser heading, descriptions, timer and recorder labels    | Clear; secondary text darkened for 4.59:1 contrast on the recorder |
| Surfaces    | Canvas, transcript, recorder, navigation and overlay tokens | Cool mineral and sea-glass surfaces with petrol actions            |
| Animations  | Palette-only diff                                           | No motion added; 10% motion replay not repeated                    |
| Icons       | Current-color recorder and navigation icons in browser      | Petrol color follows the revised palette                           |
| Performance | Production build, source diff                               | No new dependencies or effects                                     |

| Severity | Location                                                                         | Before                                                                | After                                                                                                             | Why                                                                                        |
| -------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| MEDIUM   | `src/design-trial.css:93`, `src/design-trial.css` Tide navigation/recorder rules | Terracotta actions, peach panels and warm hardcoded navigation colors | Mineral canvas, petrol actions, sea-glass recorder; nav colors use tokens; semantic status colors remain distinct | Surface hierarchy follows the user's requested direction and keeps readable state contrast |
| LOW      | `src/lib/design-trial.ts:30`, `DESIGN-TRIAL.md:10`                               | Clay name and warm swatches                                           | Tide name, matching swatches and updated palette description; persisted `clay` id retained                        | Selector accurately represents the updated design without breaking saved choices           |

Considered but rejected: a plain gray/white palette would return to the washed-out feel the user originally rejected; purple gradients would introduce another familiar AI-app treatment.

Verification: desktop TypeScript check, ESLint on the changed TypeScript file, production build, and `git diff --check` passed. Browser opened Tide, inspected its idle workspace, and opened/closed the voice preview. No horizontal overflow or console errors were observed at the attached viewport. Ten foreground/background pairs passed 4.5:1: primary text 9.50:1, secondary recorder text 4.59:1, primary action 6.88:1, hover action 9.03:1, plus accent, success, danger and warning pairs. Disabled controls are excluded from these text-contrast claims.

Verdict: **Approve** for this palette revision. Not verified again: native recording, alternate window sizes, and motion replay; no layout, native, or animation behavior was changed in this revision.

## Tide logo candidate

The existing five-bar waveform now has a Tide-specific SVG variant at `public/voxtype-tide.svg`: petrol tile, pale sea-glass bars, and a subtle black inset outline. It stays static at rest. The desktop brand and browser favicon switch with the selected design; the other three directions keep their original logo. Native packaged icons and mobile assets are unchanged pending selection.

Verified: SVG parses, the desktop mark loads at 32px, and switching Studio → Tide updates both the visible mark and favicon correctly. TypeScript, ESLint on the changed modules, and the production build pass. Native packaged-icon appearance is not verified because those assets were not changed.

## Sidebar and icon refinement

Full review scoped to the desktop shell and icon migration. React, Tailwind, existing Radix primitives and locally owned shadcn components remain the base. `components/ui/sidebar.tsx` adapts shadcn's MIT-licensed new-york Sidebar composition for this desktop app; source/license are recorded in `THIRD-PARTY-NOTICES.md`. No mobile package changed.

Phosphor is the single desktop icon family. Regular icons are the default; selected navigation uses filled glyphs; the large recorder, empty states and shortcut card use restrained duotone accents. All use currentColor. The central icon module uses direct per-icon imports, and Lucide was removed from desktop dependencies. Labels remain on controls, with decorative SVGs hidden from assistive technology.

| Category    | Evidence inspected                                                      | Result                                                                                       |
| ----------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Typography  | Sidebar labels, footer, page header in browser                          | Clear; compact labels remain readable and named when collapsed                               |
| Surfaces    | Expanded/collapsed sidebar and workspace bounds                         | 248px/80px states reserve the correct space; no horizontal overflow at the attached viewport |
| Animations  | Sidebar/menu source, loading controls                                   | No custom collapse animation; explicit color transitions; existing spinner behavior retained |
| Icons       | Navigation, History, Settings language menu, recorder and voice overlay | Phosphor glyphs render consistently, including selection, spinner and stop states            |
| Performance | Production build and direct icon imports                                | 736 modules transformed; bundle 752.57kB, 231.67kB gzip; large-chunk warning remains         |

| Severity | Location                                                                                                                                                                                                                     | Before                                                         | After                                                                                                               | Why                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| MEDIUM   | `src/App.tsx`, `src/components/ui/sidebar.tsx`, `src/components/layout.tsx`, `src/design-trial.css`                                                                                                                          | Palette-specific top navigation or hand-built sidebar          | Shared shadcn-based sidebar with navigation, shortcut card, profile footer and keyboard-accessible collapse control | Consistent desktop navigation and explicit selected state |
| MEDIUM   | `src/components/icons.ts`, `src/App.tsx`, `src/components/overlay.tsx`, `src/components/design-switcher.tsx`, `src/components/ui/{button,dialog,dropdown-menu,select}.tsx`, `src/pages/{History,Login,Profile,Settings}.tsx` | Lucide glyphs with ad hoc stroke widths and fill overrides     | One Phosphor family, regular/selected/duotone roles, currentColor, decorative accessibility treatment               | Consistent icon weight and state communication            |
| LOW      | `components.json`, `tsconfig.json`, `vite.config.ts`, `src/styles.css`                                                                                                                                                       | No shadcn project configuration                                | Registry configuration, source aliases and palette-backed shadcn token names                                        | Components share the existing design system               |
| LOW      | `package.json`, workspace lockfile, `THIRD-PARTY-NOTICES.md`, `src/lib/design-trial.ts`, this document                                                                                                                       | Lucide dependency and trial descriptions tied to older layouts | Phosphor dependency, license attribution and updated trial descriptions                                             | Accurate implementation provenance and review labels      |

Considered but rejected: multiple icon libraries would mix visual weight; swapping Radix for another primitive library would duplicate the existing shadcn base; adding a drawer for the separate mobile app would exceed the desktop-only scope.

Verification: `pnpm --filter @voxtype/desktop check-types`, `pnpm --filter @voxtype/desktop exec eslint src --max-warnings 0`, `pnpm --filter @voxtype/desktop build`, and `git diff --check` passed. Browser checks covered expand/collapse, Ctrl+B, all main navigation labels, History's empty state, the Settings language menu, and simulated cleaning controls including the overlay spinner. Test session data was restored to idle, sidebar expanded, Tide selected. No new runtime errors occurred during these checks.

Verdict: **Approve** for desktop preview. Not verified: native recording/paste, alternate window sizes (preview resize timed out), full hover/focus/pressed-state motion replay at 10% speed, and reduced-motion emulation.
