# Interface rollout

1. [x] Standardize the chosen palette in shared/theme.ts and generate platform values.
2. [x] Replace desktop trials with a fixed sidebar, concise screens and owned in-app recording.
3. [x] Extend API analytics with averages and provider usage estimates; retain account isolation.
4. [x] Page local transcripts on both platforms (12 rows per request).
5. [x] Build native mobile primitives, bottom tabs, explicit recorder and focused-field bubble rules.
6. [x] Generate proper brand, launcher and splash assets.
7. [x] Complete runtime, lint, type, build and visual checks; update the existing PR.

Android device checks still needed: permission denial/revocation, keyboard dismissal,
switching fields/apps while recording, backgrounding, bubble dragging, and launcher/splash
rendering on a real launcher. Web preview verifies React Native layout, not OS overlays.

## Validation

- `pnpm check` — formatting, ESLint, API/desktop/mobile/shared types, Rust Clippy.
- `pnpm check-types` — also type-checks the test harness.
- `pnpm test` — D1 runtime and Rust tests for pagination, isolation, aggregation, upload retries and usage.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` — local transcript page boundaries, account isolation, deleted cursors and search.
- `pnpm --filter @voxtype/desktop build` and mobile Expo web export.
- Android `:voxtype-native:compileDebugKotlin` after Expo prebuild.
- Desktop browser: fixed 228px sidebar, one visible heading, external session isolation,
  12-row transcript fixture and load-more, dropdown alignment.
- Mobile browser: Home, Settings, Transcripts, 390px phone layout, logo size and overflow.

Mobile icon imports use individual Phosphor modules. This reduced the web bundle from
8 MB / 4,438 modules to 2.3 MB / 1,425 modules in the checked build.

The broader Android `:voxtype-native:lintDebug` run failed inside the third-party
`react-native-worklets:lintAnalyzeDebug` task with a Kotlin analysis crash
(`Cannot find a KaModule for the VirtualFile`). This is not counted as a passing
Android lint check. Native Kotlin compilation and workspace lint passed.
