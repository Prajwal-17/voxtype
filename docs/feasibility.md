# Feasibility gate — 2026-09-24

## Decision

**Capture alternative approved and implemented.** The user reproduced `NotAllowedError` on their desktop and authorized replacing web microphone capture with an installed Linux utility. Flow now uses `parec` through Neutralino process APIs. Overlay focus remains an independent gate; it has not been verified here.

## Evidence

- Pinned runtime: Neutralino **v6.9.0**, client library **6.9.0**, CLI **11.7.2**.
- The [release's Linux webview implementation](https://github.com/neutralinojs/neutralinojs/blob/v6.9.0/lib/webview/webview.h) creates a WebKit webview and configures settings but contains no `permission-request` signal handler or user-media permission grant. Search the pinned source for `permission-request` and `user_media` to reproduce the inspection.
- [WebKitGTK documents](https://webkitgtk.org/reference/webkit2gtk/2.41.2/class.UserMediaPermissionRequest.html) that unhandled microphone/camera permission requests are denied by default.
- Therefore, the proposed `getUserMedia` capture path is not supported by this stock Linux integration as inspected. This is a source-level finding, **not a claimed live result on the user's machine**.
- [Neutralino window APIs](https://neutralino.js.org/docs/api/window/) expose show/hide, borderless and always-on-top controls, but no explicit accept-focus/focus-on-map control. Non-focusing overlay behavior remains unverified on GNOME Wayland. Exact screen placement and fullscreen behavior also require local validation.

## Environment and validation

This implementation environment is a headless VM (`XDG_SESSION_TYPE=tty`, no DISPLAY or WAYLAND_DISPLAY), with missing GTK libraries. It cannot stand in for the user's Ubuntu GNOME Wayland desktop. No Deepgram credentials were supplied.

| Check | Result |
| --- | --- |
| Frozen dependency installation | Passed |
| TypeScript checks for desktop and core | Passed |
| Production web bundle | Passed |
| Pinned runtime download | Passed |
| Native microphone and live Deepgram | New parec adapter implemented; physical input and live Deepgram still require user desktop/key |
| PCM transport and helper cleanup | 9 automated tests passed, including shell integration with a test-only fake audio source |
| Overlay preserves focus | Not run; local graphical session required |
| Clipboard/paste into target apps | Not run; local graphical session required |
| Global shortcut / single-instance IPC | Deferred behind gate |
| Aggregate idle/recording memory | Not measured; local graphical session required |

Transport and process lifecycle now have automated tests. No finished installer or completed product session state machine is claimed. Tests use a synthetic audio source, not a physical microphone.

## Local result sheet

Run the README steps in both your browser and editor. Record:

- GNOME version (`gnome-shell --version`), target app names/versions.
- Microphone probe result and whether any permission prompt appears.
- Whether all typed characters remain in the target field as the overlay appears.
- Whether the overlay stays above the target, and whether it can be positioned as desired.
- Whether paste lands in the intended field.

Do not include credentials or sensitive transcript content in reports.

## Integration decision

The user selected stock Neutralino plus Linux audio capture. Implemented with `parec` from `pulseaudio-utils`, Bash, and GNU coreutils. Audio is signed little-endian 16-bit PCM, mono, 16 kHz. Newline-delimited base64 safely crosses Neutralino's UTF-8 process event channel; TypeScript decodes it before sending binary WebSocket frames to Deepgram with explicit encoding/sample rate/channel parameters.

The capture process waits for an application handshake, accepts stop via stdin, drains the encoder before acknowledging completion, and terminates on EOF, signals, or a safety timeout. Tests cover chunk splitting, non-UTF8 samples, stop-tail draining, cancel during startup, late events, duplicate stop, and audio-server failure. The native window close handler now waits for cancellation before exiting.

No framework patch, Rust service, or custom Node runtime was added. Deepgram credentials never reach the shell command or process environment. This resolves the implementation of the alternative capture route, but does not establish on-device performance or overlay compatibility.

## Remaining implementation after the gate

Single-instance `flow toggle/cancel/settings` IPC; tested session lifecycle and transcript assembly; production overlay; keyring-backed settings; microphone/language choices; automatic paste and recovery; autostart; dependency setup/uninstall; Ubuntu x86-64 release archive; performance measurement across the complete WebKit process tree. The 150 MB idle figure remains an optimization target, not a measured result.
