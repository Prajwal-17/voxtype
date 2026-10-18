# Desktop interface

VoxType uses the same compact, quiet green direction as its mobile app. Keep Mona Sans, the shared semantic palette, local Radix/shadcn components, and one Phosphor icon family. Green emphasizes recording, selection, and focused controls. Canvas and surface tones, spacing, and selective dividers carry the hierarchy.

## Workspace

The 196px sidebar has 40px navigation rows and a compact shortcut entry. At browser widths of 650px or less it becomes a 64px icon rail; every navigation control retains an accessible name. The native title bar is 32px high (44px for coarse pointers) with drag, minimize, maximize/restore, and close behavior. Closing the window preserves the tray and global shortcut listener.

Page content is at most 1120px wide. Standard controls have a minimum height of 36px; icon buttons and compact actions are 32px. Buttons and tabs expand to at least 44px targets for coarse pointers, except for the compact activity calendar cells. Switches keep their compact visual size with an extended hit area. Keyboard focus, caret, selection, scrollbars, and numeric alignment use the existing theme.

## Recording

Home gives one clear recording action, followed by a small activity overview and recent transcripts. The recorder puts its state, elapsed time, finish, and cancel controls together. Finished text remains selectable and copyable in a bounded scrolling region. Recent transcript rows open the reader directly.

App-owned recording remains mounted across navigation. Secondary pages show a compact Finish/Cancel bar. External shortcut sessions remain in the native overlay and never become Home's recorder session. The 288px overlay canvas and its 52px capsule retain existing recording, focus, tray, monitor placement, and recovery behavior.

## Transcript library

Transcripts is one list, without separate transcript/recording tabs. It combines saved transcripts and the latest ten local takes by ID, deduplicates rows and sorts newest first. Unfinished takes without a saved transcript remain recoverable and carry an Original label. Search matches cleaned text and retained originals. A take's original text and audio join only its matching transcript; audio never crosses between records.

At wide content widths the library shows a compact list beside a reader. At 740px of available content or less it shows either the list or the selected reader with Back. There are no per-row expand/collapse controls. List rows show a two-line excerpt, date, duration, and audio availability. The reader keeps metadata, Copy, and one action menu together. Copy original appears when original text is retained, Export audio when audio exists, and Delete when a saved transcript exists. Older text-only takes omit unavailable recording commands. Regenerate is visible beside the player rather than inside the menu. Regeneration and deleting a synced transcript require confirmation. Failures preserve the saved content and expose retry.

A single compact player and Regenerate action mount only for the selected take with local audio. The player provides play/pause, seeking, elapsed/total time, and retry. Switching records or leaving the library releases the audio URL and pauses playback. Recording and regeneration pause and disable playback.

History is read from the current account's local store in cursor pages of 12. Search runs before pagination. Background refresh preserves visible content. Search can keep the previous query's data only within the same account. A future SQLite migration can reduce the existing JSON store's internal document-read cost without changing the UI contract.

## Insights

A compact range control selects 7 days, 30 days, or All time. One chart switches between Words and Speed. The activity calendar, daily detail, full-history streaks, and accessible chart tables remain available. CSV export lives in the page action menu. Queries remain isolated by account, range, timezone, and calendar date.

## Settings and account

Settings uses Voice, Dictionary, Behavior, and Desktop tabs. Spacing separates preference rows, toggles and sections; their horizontal rules are removed while the category-tab separator remains. A single preference draft survives tab changes; Save/Discard and navigation protection preserve unsaved edits. Shortcut changes retain their separate explicit save. The dictionary uses individual word chips and one short add field, saving to the shared account independently of device preferences. See [dictionary synchronization](../../docs/DICTIONARY.md).

Microphone, language, voice detection, cleanup, auto-paste, launch at login, and shortcut controls are retained. Diagnostics appear under Help & diagnostics; current system warnings remain visible. Account copy distinguishes synced transcripts/dictionary from device preferences and local audio.

Packaged builds enable launch at login using `--background`, which hides the main window. Development browser-backed debug sessions cannot launch without Vite; production and development continue to use separate identities, credentials, settings, API environments, and shortcuts. The launcher and tray assets retain their current behavior.

## Verification

Use the Vite browser build for UI review, including the native minimum 760px width and the normal 1100px desktop window. Isolated browser fixtures may simulate IPC for recording, audio, failure/retry, settings, and account states; label those fixtures as review data. They do not verify actual microphone capture, operating-system permissions, native playback or file dialogs in the Tauri app. Preserve keyboard operation, visible focus, reduced motion, contrast, and overflow behavior.
