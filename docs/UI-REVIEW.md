# Interface review

Mode: full. Scope: desktop React/Tailwind/shadcn screens, React Native mobile screens,
shared visual values, logo assets and Android bubble code. Browser review covers
rendering and interaction; it cannot verify microphone capture, permissions, insertion
or launcher behavior on an Android device.

| Category    | Evidence inspected                                                             | Result                                                      |
| ----------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Typography  | Home metrics, settings labels, transcript rows, shared theme                   | Clear; tabular metrics, concise labels                      |
| Surfaces    | Desktop Home/Settings; mobile 390px Home/Settings/Transcripts                  | Clear; shared palette, native cards, no horizontal overflow |
| Animations  | Button press states; native bubble width/spinner code; reduced-motion rules    | Simple transitions; OS motion not device-verified           |
| Icons       | Phosphor imports, desktop active states, mobile tabs, generated launcher files | Consistent icon family; bounded logo dimensions             |
| Performance | Transcript page contracts, FlatList, desktop build, mobile export              | 12-row requests; mobile icons imported individually         |

| Severity | Location                                             | Before                                                        | After                                                                                | Why                                                              |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| HIGH     | Desktop App/Home and session bridge                  | Home mirrored shortcut sessions                               | Explicit recording IDs and separate in-app session cache                             | Session ownership prevents unrelated text and controls appearing |
| HIGH     | Mobile home and native recorder                      | Bubble status dominated Home; no standalone recorder          | Foreground recorder independent of accessibility                                     | Intentional action and separate session state                    |
| HIGH     | Android FocusGuard/accessibility service             | Stale editor focus could retain a bubble                      | Require focused, visible, enabled input, keyboard, microphone permission and account | Prevent background-screen interruption                           |
| MEDIUM   | Desktop/sidebar/settings/transcripts; mobile screens | Trial themes, repeated headings, dense prose, full-list reads | Fixed navigation, single visible heading, concise controls, cursor pages             | Hierarchy and restrained information density                     |
| MEDIUM   | Shared package and native bubble constants           | Divergent palettes and adapters                               | One theme source with generated CSS/Kotlin                                           | Consistent semantic colors and geometry                          |
| MEDIUM   | Desktop select trigger                               | Arrow positioned against page                                 | Relative trigger with 40px minimum height                                            | Optical alignment and hit area                                   |
| MEDIUM   | Mobile assets/app config                             | Generic launcher/splash setup                                 | Safe-zone adaptive mark, monochrome mark, explicit splash size                       | Consistent brand at native sizes                                 |
| MEDIUM   | Mobile icon imports                                  | Entire icon barrel bundled                                    | Individual icon modules                                                              | Web output reduced from 8 MB to 2.3 MB                           |
| LOW      | Pending screens and metrics                          | Multiple loading phrases and visual treatments                | Shared platform Loader and tabular values                                            | Stable, quiet feedback                                           |

Considered and rejected:

- Empty decorative activity charts: zero-data screens are clearer with the four useful metrics.
- Cost inferred from transcript word counts: provider token usage and an audio-duration estimate are more honest.
- More bubble animation: static recording bars and a brief resize keep attention on the active field.

Verification: see INTERFACE-IMPLEMENTATION.md for commands and results. Browser checks
covered navigation, empty states, a populated 12-row transcript fixture, the load-more
control, fixed sidebar behavior, dropdown alignment and an injected external session.
Reduced motion has code paths; slow-motion/device playback was not performed.

Verdict: Approve for the inspected web layouts. Not verified: real microphone sessions,
Android accessibility/bubble behavior, permission prompts, launcher masks and splash
on physical hardware. These remain device release checks.

## Overlay and interaction follow-up

Mode: full within the reported desktop overlay, tooltip, hover and icon scope.
React/Tailwind/Radix styling remains in the existing utility and base layers.

| Category    | Evidence inspected                                                                        | Result                                                              |
| ----------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Typography  | Tooltip text and computed foreground/background                                           | Readable pale text on dark ink                                      |
| Surfaces    | html/body/root backgrounds, tooltip, menu highlight, dialog scrims                        | Overlay roots transparent; main canvas retained                     |
| Animations  | Existing 150ms color transitions; refresh hover slowed to 10%                             | Continuous color change; no added entrance motion                   |
| Icons       | Stop SVG, desktop PNG/tray, Android adaptive/monochrome/splash and notification resources | Larger dark stop; centered assets; dedicated small monochrome marks |
| Performance | Desktop production build and shared component changes                                     | No new animation or frontend library                                |

| Severity | Location                                                                                                                                           | Before                                                              | After                                                                                                                        | Why                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| HIGH     | `apps/desktop/src/styles.css:17`                                                                                                                   | Unlayered body canvas overrode transparent utility                  | Body defaults in base layer                                                                                                  | Overlay must not obscure the screen with an opaque rectangle |
| HIGH     | `apps/desktop/src/components/overlay.tsx:109`                                                                                                      | Pale sidebar token on pale stop button; 11px glyph                  | Dark overlay foreground; 14px glyph                                                                                          | Stop must remain immediately distinguishable                 |
| MEDIUM   | `apps/desktop/src/components/ui/tooltip.tsx:19`                                                                                                    | Pale navigation surface and pale text                               | Dark ink, pale text, bounded width, compact radius/shadow                                                                    | Consistent legible tooltip surface                           |
| MEDIUM   | `apps/desktop/src/components/ui/button.tsx:13`, `ui.tsx:40`, `ui/sidebar.tsx:122`, `ui/select.tsx:18`, `ui/dropdown-menu.tsx:21`, `overlay.tsx:71` | Mixed hover fills and navigation colors assumed dark surfaces       | Soft accent/dark text on light controls; overlay-specific hover; active navigation stays dark; disabled buttons retain state | Coherent interaction contrast                                |
| MEDIUM   | `apps/desktop/src/styles.css:70`, `components/ui/kbd.tsx:11`, `ui/dialog.tsx:18`, `ui/alert-dialog.tsx:16`                                         | Inverse foregrounds and light dialog scrims tied to sidebar tokens  | Correct light-sidebar foreground mappings and dark ink scrims                                                                | Semantic surfaces must retain readable foregrounds           |
| MEDIUM   | `apps/desktop/src-tauri/src/lib.rs:422`, Android `VoxTypeAccessibilityService.kt:655`, `scripts/generate-icons.py`                                 | Full launcher tile in tray; generic Android notification microphone | Dedicated transparent monochrome VoxType marks                                                                               | Small system icons need a clean silhouette                   |
| LOW      | `apps/desktop/src-tauri/tauri.dev.conf.json:17`                                                                                                    | Old white native main-window background                             | Shared canvas color                                                                                                          | Avoid mismatched startup paint                               |

Considered and rejected: forcing every surface transparent with `!important` (would hide
the CSS layering defect); changing the whole palette again (the errors were incorrect
token pairings); using the full tile for notification icons (Android needs an alpha mask).

Browser verification: overlay html/body/root computed to transparent; stop foreground
was `rgb(22,60,64)` at 14px. Main body retained `rgb(220,230,229)`. Tooltip used
`rgb(25,59,62)` with `rgb(241,247,245)` text. Highlighted language option and hovered
refresh button used the soft accent with dark accent text. Active sidebar hover stayed
dark. Icon audit checked visible bounds and Android generated adaptive resource links.
Desktop types, ESLint, Rust Clippy, production build and startup/routing tests are run
for this follow-up; Android compile and targeted lint check the new notification resource.

Verdict: Approve for inspected browser surfaces and asset configuration. Not verified:
native compositor transparency after this patch, real desktop login/reboot, Android
launcher/notification rendering on hardware. Existing full Android dependency-lint
limitation still applies.

## Mobile bubble 0.0.5

Mode: full within the native Android bubble. The implementation uses Kotlin Views,
WindowManager overlays and shared palette values. A browser cannot render or verify
this OS overlay; the following review covers source, geometry/audio tests and compilation.

| Category    | Evidence inspected                                             | Result                                                             |
| ----------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Typography  | Cancel/stop/status glyphs, accessibility descriptions          | Clear labels; no additional visible prose                          |
| Surfaces    | VoxConstants colors, safe bounds and dock geometry             | Translucent light green surfaces; opaque controls; edge anchoring  |
| Animations  | Drag/press handlers, placement animator and BubbleWaveformView | Interruptible snap/resize, real PCM waveform, reduced-motion paths |
| Icons       | Tinted idle mark, cancel and stop controls                     | Dark mark/cancel on light surfaces; distinct primary stop          |
| Performance | Single canvas waveform, volatile audio level, callback cleanup | No React updates per audio packet; animation stops when hidden     |

| Severity | Location                                                                         | Before                                                   | After                                                                                                                                 | Why                                                                            |
| -------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| HIGH     | `VoxTypeAccessibilityService.kt`, `BubbleGeometry.kt`                            | Arbitrary saved coordinates and mid-screen default       | Nearest-edge docking, bottom-edge default above keyboard, relative saved height, inset-aware bounds and anchored expansion            | Keep the overlay out of the center and usable across keyboard/rotation changes |
| MEDIUM   | `VoxTypeAccessibilityService.kt`, `BubbleWaveformView.kt`, `BubbleAudioLevel.kt` | Five fixed bars disconnected from capture                | Eleven smoothed history bars driven by real signed PCM energy; silence settles                                                        | Recording feedback must reflect speech                                         |
| MEDIUM   | `VoxConstants.kt`, `VoxTypeAccessibilityService.kt`                              | Saturated opaque bubble with white controls              | Muted light surfaces at 90–94% background opacity; opaque readable controls                                                           | Reduce visual interruption without losing contrast                             |
| MEDIUM   | `VoxTypeAccessibilityService.kt`                                                 | Drag had no dock feedback; cancel gestures could dismiss | 220ms edge settling, 120ms press response, lift/haptics, explicit performClick, canceled-drag protection; drop-to-close stops capture | Predictable native manipulation and lifecycle behavior                         |

Considered and rejected: perpetual decorative waves (would imply speech during silence),
fading the entire window (would also fade controls), and free resting positions (would
preserve the reported center-screen obstruction).

Verification: seven native JVM tests cover edge selection, resizing, keyboard/rotation
bounds, tiny windows, silence, volume response and signed PCM decoding. Native Kotlin
compilation and targeted Android lint were run; mobile TypeScript and ESLint were run.
Generated Gradle test reports are excluded from ESLint. Full dependency lint retains the
previous upstream worklets exclusion.

Verdict: implementation checks pass. Not verified: Android touch/keyboard behavior,
waveform rendering, haptics and animation playback at 10% speed on a device. Follow the
device checks in apps/mobile/README.md before treating native visual QA as complete.
