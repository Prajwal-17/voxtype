# Desktop interface

Use the shared semantic theme, local shadcn/Radix components and Phosphor icons.
The sidebar stays expanded at native window widths; browser previews below 650px use a labeled-accessible icon rail. Screens own their heading; there is no duplicate title bar.
Home puts the explicit recorder before a 30-day overview and recent transcripts. External shortcut sessions
remain in the overlay and never become the Home recorder's session.

Transcripts are read from the current account's local store in cursor pages of 12.
Search runs before pagination. The existing JSON store still reads its document
internally; only one page crosses IPC and renders. A future SQLite migration can
remove that storage-level cost without changing the UI contract.

Settings groups Voice & language, Workflow and Desktop controls. A single preference draft survives tab changes, with Save/Discard and navigation protection; shortcut changes have a separate explicit save. It retains microphone, language, voice detection, cleanup, auto-paste,
vocabulary and shortcut controls. Diagnostics show failures only.

Installed builds enable **Launch at login** by default, using Tauri's autostart plugin
with `--background`. That argument keeps the main window hidden; normal launcher and
tray Open actions show it explicitly. Closing the main window leaves the tray and
shortcut listener running. Shortcut authentication or capture errors stay in the
overlay, with an explicit recovery button to open the app.

The login setting is unavailable in Vite-backed debug sessions because those binaries
cannot run without the development server. Packaged development and production builds
use separate login entries. Right Alt remains the production default; development
keeps its separate shortcut to avoid conflicts.

Launcher/window assets use the full petrol tile. The top-bar tray uses the transparent
monochrome mark, generated from the same SVG. Login behavior follows the
[Tauri autostart integration](https://v2.tauri.app/plugin/autostart/).

Insights supports 7 days, 30 days and All time, with account/range/timezone query
keys. Its 98-day calendar and full-history streaks are independent of the headline
range. CSV export uses an authenticated server request followed by a GTK native
save dialog; cancel leaves no file. The API update must ship alongside the clients.

Transcripts require confirmation before account/cloud deletion. A failed deletion
keeps the local record. Settings remain mounted across navigation; app-owned recording
continues while Home is hidden and exposes Finish/Cancel on secondary pages.

The 288px overlay canvas is 68px high (76px in development) around a 52px capsule.
Waveform, finish and cancel are ordered consistently with Android. Native focus,
tray, monitor placement and recovery behavior are preserved by the existing backend.
