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
- Desktop browser: fixed 174px sidebar, one visible heading, external session isolation,
  12-row transcript fixture and load-more, dropdown alignment.
- Mobile browser: Home, Settings, Transcripts, 390px phone layout, logo size and overflow.

Mobile icon imports use individual Phosphor modules. This reduced the web bundle from
8 MB / 4,438 modules to 2.3 MB / 1,425 modules in the checked build.

The broader Android `:voxtype-native:lintDebug` run failed inside the third-party
`react-native-worklets:lintAnalyzeDebug` task with a Kotlin analysis crash
(`Cannot find a KaModule for the VirtualFile`). This is not counted as a passing
full Android lint check. Native Kotlin compilation and workspace lint passed.

The targeted native lint run passed with **0 errors and 14 warnings** after aligning
the module minimum SDK with the app's Android 13 requirement and enabling
`abortOnError`. The command excludes dependency analysis affected by the crash:

```sh
./gradlew :voxtype-native:lintDebug \
  -x :react-native-worklets:lintAnalyzeDebug \
  -x :expo-modules-core:lintAnalyzeDebug
```

Warnings cover dependency updates, redundant SDK guards, static context references,
KTX suggestions and touch-listener accessibility checks. They remain visible in the
report; real-device accessibility and lifecycle checks are still required.

## Refined Still rollout

Shared theme and generated CSS/Kotlin now use light Still surfaces and petrol accents.
Both apps include dedicated Insights, recorder-first Home, inline transcripts, Settings
and Account. Desktop protects preference/shortcut drafts and keeps app-owned recording
visible across pages. Native mobile state lives above Expo Router tabs.

The analytics endpoint now accepts an IANA timezone, defines local calendar ranges,
returns full-history streaks and an independent compact 14-week grid, and bounds trend
payloads. Real CSV export uses a native GTK save dialog or Android share chooser.
Android adds complete-cache search, cloud-aware deletion and a separate live PCM-level
event. Capsules have fully rounded ends and shared dark colors, with no mic tile or timer.

The existing Android recovery and diagnostic-report work remains part of this branch.
Repository checks and native CI are recorded with the PR; browser captures verify layout
and interaction only. Physical Android insertion/permissions and Linux overlay focus,
scaling/multi-monitor behavior still require the corresponding device/runtime checks.

## Approved follow-up

- Existing Settings screens and real-data Insights (full-history streaks, 14-week
  activity grid, ranges and CSV) are retained. Desktop already had a persisted
  personal vocabulary, sent as Deepgram keyterms. Android now has the same
  device-local dictionary limit (100 terms, 100 characters each), explicit save,
  discard and native validation. Both in-app and bubble streams use it; changing
  it drops an idle prewarmed bubble socket so the next take uses the new terms.
- The desktop main window now has an app-owned draggable title bar with minimize,
  maximize/restore (including double-click) and close. Its capabilities are scoped
  to the main window; the recording capsule keeps its existing window behavior.
- Android's browser callback and Router deep link share one grant exchange and
  its result. Both require the persisted random state (10-minute validity),
  including cold starts. Sign-out/new attempts invalidate completion state.
- `.github/workflows/mobile-dev-build.yaml` adapts Relay's manual build flow to
  this monorepo. Select a branch/commit and explicitly supply an HTTPS API origin.
  It checks source, batches native tests/lint with a standalone APK build and
  uploads a seven-day artifact. It does not deploy or create a release. The APK
  uses the existing app identity and generated development signing configuration;
  it is a test build, not a production-signed release. GitHub normally exposes a
  new workflow's manual Run button after it exists on the default branch.

Installed Android OAuth, dictation/keyterm recognition and bubble insertion still
need device E2E. Browser builds and native unit tests do not establish those results.
The analytics API must ship with these clients in a separately authorized release.

Follow-up validation in the fresh VM: all 14 TypeScript tests, workspace type checks,
mobile/desktop ESLint, Prettier, desktop production build and mobile web export pass.
A Chromium IPC fixture verifies title-bar command routing, the drag region, header
spacing and the 760px viewport. Android adds persistence/limit and keyterm encoding
regression tests to the native suite. This VM has neither Cargo nor an Android SDK;
full Rust/Kotlin/lint verification runs in PR CI. Native title-bar behavior also
requires an installed desktop runtime. No installed-app E2E result is claimed.
