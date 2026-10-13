# Interface review

The refined Still direction now covers desktop, Android screens and the recording
capsules. Desktop uses a fixed 232px sidebar, Mona Sans, the petrol
accent and compact bordered surfaces. Mobile uses four native tabs and a separate
Account screen, with the same hierarchy adapted to touch targets and safe areas.

| Area          | Result                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home          | Recorder first, account metrics and three recent transcripts. In-app results survive navigation and remain separate from shortcut/bubble sessions.                                                |
| Transcripts   | Search before pagination, fully visible text, independent copy/delete controls, confirmation and retry without removing a failed deletion.                                                        |
| Insights      | 7-day, 30-day and all-time metrics; independent 14-week calendar with 12px cells and 3px gaps; separate Words and Speed charts; accessible exact values and native CSV export.                    |
| Settings      | Desktop Voice, Workflow and Desktop tabs preserve drafts, save explicitly and confirm discarded navigation. Android retains actual permission, reconnecting-service and iQOO diagnostic guidance. |
| Account       | Google identity, cloud archive/device cache explanation, sync state and sign-out.                                                                                                                 |
| Capsules      | Dark, fully rounded recording surface; real audio levels followed by Finish and Cancel. Processing has a stable width and concise status.                                                         |
| Accessibility | Focus styles, keyboard calendar/tab navigation, selectable transcripts, reduced motion, scaled native text, touch controls and explicit pending/error states.                                     |

## Verification

- Workspace TypeScript, ESLint, formatting, generated-theme checks and Rust Clippy pass.
  The local Turbo check uses `--env-mode=loose` to retain the rootless Rust and GTK
  toolchain paths; CI uses ordinary `pnpm check` with system dependencies.
- `pnpm test` passes all 14 TypeScript cases and five headless Rust cases. Analytics cases
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

## Desktop corrections

Both production and development main-window configurations disable native decorations;
the development configuration has its own window array and must set this explicitly.
The custom 44px title bar is part of a fixed-height app shell. Only the main content
pane scrolls; the sidebar fills the remaining height and stays 232px wide. Home uses
a house icon, and desktop icons use bold strokes with 20px action targets inside
40px controls. There is no responsive sidebar collapse or transcript disclosure.

Transcripts show their complete text, including paragraph breaks, beside independent
copy/delete actions. Insights shows day details beside the calendar and separate
word/speed charts. Raw chart values remain in accessible tables, without disclosure
controls or nested scroll areas; range selection and CSV export remain available.

Copy uses GTK's clipboard on the app event thread, reusing its existing display.
Neither manual copy nor external dictation launches `wl-copy`/`xclip`; this removes
Wayland helper surfaces that can disturb focus or flicker the dock. The native
clipboard test runs under Xvfb and reads repeated Unicode/multiline copies from an
external X11 reader while checking that the app remains visible and no extra window
appears. Xvfb is not a GNOME Wayland compositor; compositor-specific behavior still
requires the user's installed desktop session.

## Overlay and cancellation corrections

The custom title bar uses the app's petrol accent, inverse controls and a restore
icon that follows the native maximized state. Both overlay capsules place Stop at
the left and Close at the right. Desktop processing shows a spinner without visible
Transcribing/Cleaning labels; those states remain available to screen readers.
Android recording places Stop at the left and Close at the right. Connection setup
and processing show only a spinner in the compact rounded bubble; tapping it cancels.
Waveforms use stronger display gain and faster response to real audio samples;
silence and reduced-motion behavior remain supported.

Android Close cancels recording and processing. Dropping the bubble on the drag
close target also cancels, rather than finishing and inserting. Cancellation
invalidates the take generation, stops capture and cleanup calls/jobs, closes the
speech stream and deletes pending audio. Saving and insertion share the main-thread
commit with the cancel event, so a late result cannot save or paste a canceled take.
The in-app recorder follows the same cleanup/pending-audio cancellation rules.
Native tests cover end controls, processing cancellation, the drag close target,
queued results, in-app cleanup and successful uncanceled completion.

## Mobile bubble motion refinement

Android recording uses a light mint surface, petrol waveform and controls, and a
subtle outline. Processing and the success check fit the 48dp bubble. Its saved
height is relative to the screen, independent of keyboard bounds; older preferences
are migrated once. Opening or resizing a keyboard leaves the bubble at that saved
position, including over the keyboard if the user placed it there. Horizontal throws
use screen-coordinate velocity to choose an edge, then ease into the dock. Touching
a moving bubble interrupts it in place, and reduced motion skips placement animation.

Native regression coverage checks keyboard resizing/reopening, preference migration,
compact state transitions, interrupted expansion, fling direction and cancellation.
Animation feel and placement on the user's phone still require installed-device checks.
