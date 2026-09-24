# Feasibility gate — 2026-09-24

## Decision

**Hold full MVP implementation at the agreed gate.** Keep the stock-Neutralino architecture unchanged until the microphone integration is revisited. The diagnostic build is available for reproducing the result on the target desktop.

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
| Native microphone and live Deepgram | Not run; microphone source-level blocker above |
| Overlay preserves focus | Not run; local graphical session required |
| Clipboard/paste into target apps | Not run; local graphical session required |
| Global shortcut / single-instance IPC | Deferred behind gate |
| Aggregate idle/recording memory | Not measured; local graphical session required |

No production session tests or finished installer are claimed. The prototype only provides manual probes; its transcript handling is not the final tested core state machine.

## Local result sheet

Run the README steps in both your browser and editor. Record:

- GNOME version (`gnome-shell --version`), target app names/versions.
- Microphone probe result and whether any permission prompt appears.
- Whether all typed characters remain in the target field as the overlay appears.
- Whether the overlay stays above the target, and whether it can be positioned as desired.
- Whether paste lands in the intended field.

Do not include credentials or sensitive transcript content in reports.

## Integration choices requiring a revised decision

1. Keep stock Neutralino and use an installed Linux audio capture utility through its process APIs. This changes the agreed web-audio capture path; streaming binary transport and helper lifecycle must be designed and verified. It does not by itself solve overlay focus.
2. Maintain a small patched Neutralino native runtime that handles microphone permission and exposes focus behavior. This introduces native framework maintenance, contrary to the current preference for stock Neutralino and TypeScript-only application work.

Neither option has been silently implemented. No switch to Rust, Electron, another framework, or a custom Node runtime has been made.

## Remaining implementation after the gate

Single-instance `flow toggle/cancel/settings` IPC; tested session lifecycle and transcript assembly; production overlay; keyring-backed settings; microphone/language choices; automatic paste and recovery; autostart; dependency setup/uninstall; Ubuntu x86-64 release archive; performance measurement across the complete WebKit process tree. The 150 MB idle figure remains an optimization target, not a measured result.
