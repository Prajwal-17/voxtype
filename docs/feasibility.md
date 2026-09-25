# Flow Linux desktop status — 2026-09-25

## Implemented

The Linux desktop app now runs as a single hidden Neutralino process with:

- a GNOME tray menu for toggle, cancel, settings, and quit;
- a private FIFO launcher bridge for flow toggle, flow cancel, and flow settings;
- immediate parec microphone startup in parallel with the Deepgram WebSocket;
- a bounded 512 KB PCM queue that flushes in order when Deepgram connects;
- final-result gating: Flow waits for capture drain and Deepgram metadata before paste;
- stdin-based wl-copy delivery followed by the existing ydotool paste helper;
- GNOME Keyring storage through secret-tool;
- manual copy recovery when credentials, network, microphone, or paste fail;
- no recording files, transcript history, API keys in logs, or custom Node/Rust service.

Neutralino 6.9.0's tray API supports a PNG icon and menu items. The configuration uses a hidden window and skipTaskbar so the idle process does not appear as a normal taskbar application. Ubuntu needs an app-indicator library for the native tray; Neutralino reports NE_OS_TRAYIER if it is unavailable.

## Automated validation

~~~text
pnpm typecheck   passed
pnpm test        13 tests passed
pnpm build       passed
pnpm package:linux passed
~~~

The tests cover PCM transport, malformed frames, helper cleanup, stop-tail draining, cancellation during spawn, queue order and queue bounds, and launcher command parsing. The release archive is apps/desktop/dist/flow-linux-x86_64.tar.gz.

## Required validation on the user's GNOME Wayland desktop

This environment is headless and cannot prove the following:

1. The tray icon renders with the installed Ubuntu app-indicator implementation.
2. Showing the always-on-top recording panel does not steal the browser/editor focus.
3. The hidden-panel transition leaves the intended target focused for ydotool.
4. The installed ydotool service and /dev/uinput permissions work for the user.
5. Deepgram connection and first-result timings on the user's network.
6. Idle and recording memory across the Neutralino/WebKit child process tree.

Run pnpm probe, open Settings from the tray, save a key, and test a browser and editor. Configure a GNOME custom shortcut with flow toggle. If focus is stolen by the overlay under Wayland, record the exact GNOME version and target application; Neutralino's stock window APIs do not expose an explicit non-focusing flag.

## Capture decision

The original WebKit getUserMedia route is not used. Neutralino's pinned Linux webview has no microphone permission handler, and WebKitGTK denies unhandled user-media requests. parec is the approved Linux capture adapter. Audio is raw signed little-endian 16-bit PCM, mono, 16 kHz; base64 only transports it through Neutralino's UTF-8 process events, and TypeScript sends decoded binary frames to Deepgram.
