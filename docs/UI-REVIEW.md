# Interface review

The refined Still direction now covers desktop, Android screens and the recording
capsules. Desktop uses a 174px sidebar (158px below 980px), Mona Sans, the petrol
accent and compact bordered surfaces. Mobile uses four native tabs and a separate
Account screen, with the same hierarchy adapted to touch targets and safe areas.

| Area          | Result                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home          | Recorder first, account metrics and three recent transcripts. In-app results survive navigation and remain separate from shortcut/bubble sessions.                                                |
| Transcripts   | Search before pagination, inline expansion, independent copy/delete controls, confirmation and retry without removing a failed deletion.                                                          |
| Insights      | 7-day, 30-day and all-time metrics; independent 14-week calendar with 12px cells and 3px gaps; Words/Speed chart; accessible exact values and native CSV export.                                  |
| Settings      | Desktop Voice, Workflow and Desktop tabs preserve drafts, save explicitly and confirm discarded navigation. Android retains actual permission, reconnecting-service and iQOO diagnostic guidance. |
| Account       | Google identity, cloud archive/device cache explanation, sync state and sign-out.                                                                                                                 |
| Capsules      | Dark, fully rounded recording surface; real audio levels followed by Finish and Cancel. Processing has a stable width and concise status.                                                         |
| Accessibility | Focus styles, keyboard calendar/tab navigation, selectable transcripts, reduced motion, scaled native text, touch controls and explicit pending/error states.                                     |

## Verification

- Workspace TypeScript, ESLint, formatting, generated-theme checks and Rust Clippy pass.
  The local Turbo check uses `--env-mode=loose` to retain the rootless Rust and GTK
  toolchain paths; CI uses ordinary `pnpm check` with system dependencies.
- `pnpm test` passes all 11 TypeScript cases and five Rust cases. Analytics cases
  include fractional timezone offsets, local midnight, DST, inclusive range bounds,
  account isolation, deletion, full-history streaks, CSV zero days and bounded trends.
- Desktop production build and Expo web production export pass.
- Chromium review covers desktop at 760×600, 1100×760 and 1440×900, plus mobile at
  360×800, 390×844, 430×932 and 768×1024. The signed-in browser preview is explicitly
  development-only and contains zero account data.
- A separate browser IPC fixture checks recording continuity, external-session
  separation, settings save/discard, transcript expansion/copy/search/pagination,
  failed deletion and retry, focus return, range requests, calendar keyboard selection
  and CSV invocation. All five desktop capsule phase states fit the 288×76 development
  canvas with reduced motion. Fixture data and scripts are excluded from production and Git.
- Android generation passes. Local native compilation/tests cannot download the
  React Native 0.86 AAR: Maven redirects to `repo.reactnative.dev`, which the managed
  environment blocks. The existing mobile PR workflow runs the actual Kotlin,
  Robolectric and lint tasks on GitHub Actions.

Browser interaction checks verify React behavior, not real native capture, insertion
or OS dialogs. Physical Android permission prompts, Google callback handling,
TalkBack/font scaling, launcher masks, accessibility retention on iQOO/Funtouch,
and Linux focus/multi-monitor capsule placement need installed-device verification.
Deploy the analytics API with the clients; no new database migration is required.
