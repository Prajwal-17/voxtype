# Desktop architecture

## Ownership

React draws the main workspace and a second, transparent overlay window. It never owns the microphone or Deepgram socket. Hiding the main window, changing pages, or remounting a component cannot stop a recording.

Tauri's Rust process owns a single recording session. Tray, GNOME shortcut command, and React actions all use the same start/stop/cancel functions. A bounded Tokio channel carries control messages; a second bounded channel carries PCM. No raw audio crosses the webview IPC boundary, and there is no base64 transport overhead.

TanStack Query owns asynchronous command state, loading/errors, preference queries, microphone lists, and history invalidation. It does not pretend a live WebSocket is an HTTP query: Rust pushes small session snapshots over Tauri events, updating the shared query cache. This is also the future seam for a backend API, without introducing one now.

## Libraries, not substitute frameworks

| Job                                    | Choice                                    | Reason                                                                                |
| -------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Desktop windows, tray, single instance | Tauri 2 + official plugins                | Maintained desktop integration; thin application commands                             |
| Right Alt shortcut                     | GNOME custom keybinding via Gio           | Physical keycode `0x6c`; replaces Flow’s old binding, preserves unrelated bindings    |
| UI                                     | React, Tailwind, Lucide                   | Familiar typed component stack and consistent icon vocabulary                         |
| Accessible controls                    | Radix Switch, Dialog, Tooltip             | Focus management and keyboard semantics from tested primitives                        |
| Audio meter animation                  | Motion, respecting reduced motion         | Spring interpolation of actual RMS measurements                                       |
| Notifications                          | Sonner                                    | Standard accessible feedback patterns                                                 |
| API/command lifecycle                  | TanStack Query                            | Pending/error state, mutation boundaries, cache invalidation                          |
| Preference validation                  | Zod + matching Rust checks                | Reject invalid values at both UI and native boundary                                  |
| Audio                                  | Ubuntu `parec`                            | Existing successful prototype path; native PipeWire/PulseAudio capture and resampling |
| Async I/O and WebSocket                | Tokio, tokio-tungstenite, rustls          | Standard Rust network primitives, bounded queues, validated TLS                       |
| Settings/history                       | Tauri Store                               | Official persistence plugin, accessed only by Rust                                    |
| API key                                | keyring-rs / Secret Service               | GNOME Keyring persistence, no plaintext key in the config                             |
| Clipboard/insertion                    | wl-copy + ydotool; xclip + xdotool on X11 | Established Ubuntu adapters rather than a custom input driver                         |

A maintained general WebSocket library is preferable to inventing a protocol client; the small Deepgram-specific message handling remains application logic. Text cleanup uses reqwest and Serde for DeepSeek’s OpenAI Responses format. No agent framework, custom database, audio codec, or raw network stack is implemented.

## Rust, in plain language

- `lib.rs`: the front door. Registers commands/plugins, builds the tray, and forwards every recording action to the session owner.
- `model.rs`: the structs shared with React. `serde` translates Rust's field names into JavaScript's camelCase. Settings validation is here.
- `audio.rs`: starts `parec`, reads signed 16-bit mono PCM at 16 kHz, and computes a loudness value. Stop signals the child, drains its final bytes, then closes the queue. Dropping the capture stops its task and kills the child.
- `session.rs`: the recording lifecycle and Deepgram adapter. A single async task owns the socket. `pump` is isolated from the desktop so local WebSocket tests can verify finalization and cancellation.
- `cleanup.rs`: pooled reqwest HTTPS client, bounded Responses API parsing, disabled reasoning, and a 15-second overall deadline. It does not log credentials or provider response bodies.
- `storage.rs`: preferences, a bounded transcript list, and keyring access. API keys never return to the webview. Audio never enters this module.
- `desktop.rs`: microphone enumeration, capability checks, clipboard writes, and paste dispatch. Subprocesses receive separate arguments; user text never becomes shell code.

`Result<T, String>` means “return the value, or a user-readable error.” `?` forwards an error to the caller. `tokio::select!` waits for whichever happens first: audio, a socket reply, a control command, or a deadline. The `Mutex` protects tiny state changes; network waits happen after its lock is released. The capture's `Drop` implementation is its cleanup guarantee.

## Recording lifecycle

1. Reserve the session slot. A second start is rejected rather than spawning another microphone.
2. Start native capture. Read the credential on a blocking worker; open the Deepgram socket. The audio queue buffers the beginning while connecting.
3. Detect speech locally and stream gated binary PCM directly to Deepgram; send React only transcript, amplitude, speech activity, elapsed time, phase, and messages.
4. Replace interim text; append each final segment once by its audio time range. `speech_final` is a pause, not a user stop.
5. On stop, signal capture and drain its queued tail before sending `CloseStream`.
6. Wait for Deepgram's final metadata. A socket close without confirmation is an error, even if some text has arrived.
7. For external recordings: hide the overlay, copy to clipboard, allow modifier release, and optionally send Ctrl+V. Preserve the transcript on failure.
8. Persist successful text if history is enabled. Release the recording slot and notify both windows.

After Deepgram confirms completion, optional DeepSeek cleanup runs before insertion. The session stays active in the `cleaning` phase; Stop is ignored and Cancel drops the request. Provider failures retain the original text and report a warning. Only a completed, non-empty assistant output replaces the transcript. Original text is available in the workspace and optional local history.

## Bounds and failure policy

Capture transport coalesces fragmented pipe reads into 96 ms, 3,072-byte PCM packets (16 kHz, signed 16-bit mono), with a 32-packet bound. The local Earshot 1.2.2 neural VAD consumes 256-sample/16 ms frames. It gates speech using 0.5 onset and 0.35 continuation thresholds, a 320 ms pre-roll, and an 800 ms tail. The tail exceeds Deepgram's 300 ms endpointing interval; wall-clock elapsed time stays separate from Deepgram's compressed audio timeline. The setting defaults on for existing and new profiles and can be disabled for difficult microphones or quiet speech. Microphone tests remain local and bypass speech gating.

Startup/stream backlog: at most 32 seconds of transmitted PCM (1,024,000 bytes), plus the capture queue (98,304 bytes), eight writer packets (24,576 bytes), and small bounded VAD/in-flight frames. Nothing persists raw audio. The meter reads ungated microphone samples during silence and connection setup. Stop during setup retains speech and finalizes after connection.

A split WebSocket has one pinned asynchronous writer, an independent receiver, and a bounded writer channel. No socket write is awaited inside the capture/control branch. The writer keeps at most one write in flight, uses 1.25× pacing for queued audio, accounts for write time, and sends a text KeepAlive after four seconds without an audio packet. It drains all queued speech and the captured tail before CloseStream. Final success requires Deepgram Metadata after the close write completes. No automatic reconnection/replay: ambiguous remote acceptance must not duplicate words or insert incomplete text.

Timeouts: connection 10 seconds; keyring 15 seconds; stalled microphone 5 seconds; socket write 15 seconds; final confirmation 15 seconds starting after CloseStream flushes. Stop drains capture for at most one second. Cancel drops the pinned writer and capture immediately. A network failure keeps received text recoverable and never automatically pastes it. Recording remains bounded to ten minutes; the former three-second blocking-write path is removed.

The existing stream test suite covers tail-before-close ordering, final text aggregation, cancellation, and rejection of premature close. It was not executed for this change, per the user’s instruction. Real audio, Secret Service prompts, and compositor behavior require the real desktop.

## Privacy and desktop limitations

History/preferences: Tauri app-data `com.flow.dictation/flow.json`. Credentials: separate Secret Service accounts `deepgram` and `deepseek` under `com.flow.dictation`. No key in URLs, logs, or history. Debug logs must never include WebSocket requests/headers.

Wayland paste follows end-of-session focus because arbitrary foreign focused fields cannot be queried reliably. The overlay is non-focusable, always-on-top, undecorated, and skipped from the taskbar. Flow uses XWayland when DISPLAY is available on Wayland, allowing GNOME window placement. It positions the compact overlay against the monitor work-area bottom and reapplies placement after mapping. Without XWayland, placement remains compositor-dependent. X11 checks the original window ID before dispatching paste. The clipboard intentionally retains the transcript; restoring it too soon races clipboard consumption.

The app is a personal-use desktop utility. A future distributed edition should replace persistent client credentials with short-lived provider tokens from an authenticated backend.

## Sources consulted

- https://v2.tauri.app/start/prerequisites/
- https://github.com/GNOME/mutter/blob/main/src/core/meta-accel-parse.c
- https://v2.tauri.app/plugin/single-instance/
- https://v2.tauri.app/plugin/store/
- https://developers.deepgram.com/reference/speech-to-text/listen-streaming
- https://developers.deepgram.com/docs/understand-endpointing-interim-results
- https://developers.deepgram.com/docs/keyterm
- https://tanstack.com/query/latest/docs/framework/react/guides/mutations
- https://www.radix-ui.com/primitives
- https://motion.dev/docs/react-use-reduced-motion

## Native verification (Ubuntu 24.04, 2026-09-27)

The first native run exposed a rustls provider-selection panic. Startup now explicitly installs the ring provider before any Deepgram connection; session failures also release the recording slot.

Verified separately from browser previews:

- The actual default microphone produces PCM, and the native Settings test starts and stops through its buttons.
- A saved key authenticates a real Deepgram WebSocket and receives final metadata after CloseStream.
- Generated speech through a temporary PulseAudio source reaches the native Start/Finish workflow and produces a final transcript.
- In a separate GTK text field on the Wayland desktop, the external toggle workflow retains field focus with the overlay open, then inserts the generated transcript using the actual clipboard/input helpers.
- The test source and separate test preferences are removed afterward. API keys are never printed, and generated test speech is not private microphone content.

These checks establish this desktop's tested path; they do not promise every application's paste behavior. GNOME key bindings still need enabling in Settings. The package uses the same pipeline, with release startup checked separately.

GNOME shortcut setup uses Gio's settings API to preserve the existing binding list, reject matching conflicts, and bind the current executable. It only writes when Enable shortcut is clicked. During debug WebKit automation, single-instance enforcement can be bypassed with TAURI_WEBVIEW_AUTOMATION=true; release builds always enforce a single instance.

Final optimized `.deb` build also passed a cold-start external dictation test: the main window stayed hidden, the overlay retained the test field's focus, and the full generated sentence was inserted. The acceptance fixture waits for the PulseAudio capture stream before playing speech; dictation should begin after the app indicates capture has started.

The compact overlay/buffering update was updated without further acceptance tests at the user’s request; the earlier verification above refers to the previous release. Streaming-rate reference: https://developers.deepgram.com/docs/recovering-from-connection-errors-and-timeouts-when-live-streaming-audio

## Fixed dictation shortcut

The shortcut is always Right Alt. It is no longer a preference; legacy saved `shortcut` fields are ignored by Serde. Startup refreshes Flow’s existing GNOME custom binding to the current executable. The Settings button retries installation and reports conflicts. GNOME handles the key; Flow does not read raw keyboard devices. Press toggles the existing single session. The former configurable accelerator parser and X11 global-shortcut plugin have been removed. This version targets Ubuntu GNOME.

DeepSeek API contract: https://api-docs.deepseek.com/api/create-response/ . The native client fixes the provider HTTPS endpoint, rejects redirects, disables retries, accepts at most 20,000 input characters and a 512 KB response, and preserves the original on failure. The model’s meaning preservation is prompted, not guaranteed; original-text recovery remains available.

VAD and streaming implementation references:

- [Earshot model and API](https://github.com/pykeio/earshot)
- [Deepgram KeepAlive](https://developers.deepgram.com/docs/audio-keep-alive)
- [Deepgram lower-level WebSocket guidance](https://developers.deepgram.com/docs/lower-level-websockets)
- [Deepgram endpointing](https://developers.deepgram.com/docs/endpointing)
