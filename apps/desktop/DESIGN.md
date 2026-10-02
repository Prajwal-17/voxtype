# Desktop interface

Use the shared semantic theme, local shadcn/Radix components and Phosphor icons.
The sidebar stays expanded. Screens own their heading; there is no duplicate title bar.
Home shows a 30-day overview and an explicit recorder. External shortcut sessions
remain in the overlay and never become the Home recorder's session.

Transcripts are read from the current account's local store in cursor pages of 12.
Search runs before pagination. The existing JSON store still reads its document
internally; only one page crosses IPC and renders. A future SQLite migration can
remove that storage-level cost without changing the UI contract.

Settings retains microphone, language, voice detection, cleanup, auto-paste,
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
