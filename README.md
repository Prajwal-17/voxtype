# Flow

Flow is a lightweight Linux voice dictation app built with Neutralino.js and TypeScript. It stays hidden in the background, exposes one tray icon, records through Ubuntu's PulseAudio/PipeWire compatibility layer, streams to Deepgram, and pastes the final transcript into the application that had focus.

This milestone is Linux desktop only. The future Android/Expo workspace is intentionally not included yet.

## Install and run on Ubuntu 24.04

Install the runtime tools once:

~~~sh
sudo apt update
sudo apt install pulseaudio-utils coreutils wl-clipboard ydotool libsecret-tools libayatana-appindicator3-1
~~~

Neutralino also needs these desktop libraries on a minimal Ubuntu install:

~~~sh
sudo apt install libgtk-3-0t64 libwebkit2gtk-4.1-0 libxtst6
~~~

Install the workspace and download the pinned Neutralino runtime:

~~~sh
pnpm install --frozen-lockfile
pnpm runtime:download
pnpm probe
~~~

Flow starts hidden and should appear in the GNOME tray/app-indicator area. Open **Settings** from the tray to save a Deepgram key in GNOME Keyring. The key is never written to a Flow settings file, shell command, or log. If the key is blank, the microphone can still be tested but there is no transcript to paste.

ydotool may require its user service and /dev/uinput access on the target machine. Flow does not install a privileged daemon. If the dependency check reports ydotool but paste fails, configure the helper according to the Ubuntu package instructions and rerun the check.

## Shortcut and tray behavior

The bundled flow launcher sends commands to the existing app through a user-private FIFO. It does not start a second Neutralino window:

~~~sh
flow toggle
flow cancel
flow settings
~~~

Add flow toggle as a GNOME custom shortcut, with Ctrl+Alt+Space as the default suggestion. Install the launcher and binary from the release archive onto the same directory, for example:

~~~sh
mkdir -p ~/.local/bin
install -Dm755 flow-linux_x64 ~/.local/bin/flow-linux_x64
install -Dm755 flow ~/.local/bin/flow
~~~

The tray menu has the same toggle, cancel, settings, and quit actions. Flow hides its window and skips the taskbar while idle. During dictation it shows a compact always-on-top panel; after finishing it hides the panel before clipboard delivery.

## Fast startup and reliable cleanup

Each session starts parec immediately and opens the Deepgram WebSocket at the same time. PCM chunks are held in a bounded 512 KB in-memory queue until the socket is open, then sent in order. The queue protects the desktop from unbounded memory growth if the network is unavailable. A connection timeout, microphone timeout, or Deepgram error stops the helper and leaves any received transcript visible for manual copying; incomplete text is never pasted automatically.

Finish drains the last microphone bytes, sends Deepgram CloseStream, waits for the final metadata response, copies the complete text with wl-copy through standard input, and triggers paste with ydotool. The transcript remains on the clipboard for recovery. Cancel discards the current session and releases the microphone.

No recordings or transcript history are saved. Idle and recording memory/CPU still need measurement on the target GNOME Wayland desktop.

## Build, test, and package

~~~sh
pnpm typecheck
pnpm test
pnpm build
pnpm package:linux
~~~

The last command creates apps/desktop/dist/flow-linux-x86_64.tar.gz containing:

- flow-linux_x64 — the Neutralino Linux binary
- resources.neu — the bundled web UI, capture helper, tray icon, and configuration
- flow — the launcher used by GNOME custom shortcuts
- flow.desktop — an optional application entry

Development tools (Node.js, pnpm, Vite, and Turbo) are not required by the packaged app. There is no Rust service or custom Node background server.

## Troubleshooting

- Missing parec: install pulseaudio-utils, run Flow as the logged-in desktop user, and choose the correct input in Settings → Sound.
- NotAllowedError: the Linux WebKit microphone permission path is not used; Flow captures with parec.
- Missing tray icon: Ubuntu needs an app-indicator library for Neutralino's tray API. The settings window and launcher still work while that dependency is repaired.
- Deepgram timeout: check network access and the key in Settings. Flow will record while connecting, but it stops safely if the bounded startup buffer fills.
- Paste failure: the final transcript stays in the app and clipboard. Check wl-copy, ydotool, and the target app's focus.

pnpm dev is only a browser UI preview; native microphone, tray, keyring, launcher, and paste features require pnpm probe in the graphical Ubuntu session.
