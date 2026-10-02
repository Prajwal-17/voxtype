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
