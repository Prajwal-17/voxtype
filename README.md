# Flow

A personal Ubuntu dictation app built with **Tauri 2, React, TypeScript, Tailwind CSS, and TanStack Query**. It detects speech locally with an embedded Earshot neural VAD, streams speech directly to Deepgram Nova-3 and can paste the transcript into the focused app.

This branch replaces the Neutralino prototype. There is **no Cloudflare server, account system, cloud sync, or cloud transcript storage**. Audio is sent to Deepgram for recognition; audio recordings are never written to disk. Your provider API keys live in the desktop Secret Service keyring. Optional DeepSeek cleanup runs after transcription and before insertion. Optional transcript history lives on this device.

## Run on Ubuntu

Requirements: Node 22+, pnpm 10, a recent stable Rust toolchain, and Ubuntu desktop libraries.

```sh
sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev librsvg2-dev libssl-dev libdbus-1-dev \
  pulseaudio-utils wl-clipboard ydotool ydotoold xdotool xclip gnome-keyring
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` starts the **native Tauri application**. `pnpm dev:web` is a browser-only design preview; it clearly disables native recording and persistence.

1. Open **Settings → Deepgram connection** and paste your API key. The app never returns saved credentials to React or writes them to the settings file.
2. Choose your microphone, save preferences, then use **Test mic**. This test stays entirely local and ends automatically after 30 seconds.
3. Try **Start dictation** inside Flow. Press **Finish dictation** to see and copy the final transcript.
4. Set up the desktop shortcut below, focus a text field in another app, press the shortcut, speak, and press it again. Flow copies and sends a paste shortcut after Deepgram confirms the recording is complete.

Close the main window to keep Flow running in the background. Use the tray menu to open it again or quit. On GNOME, tray visibility may require the Ubuntu AppIndicators extension. Running the app again also opens the existing instance.

## Installable build

```sh
pnpm build:desktop
```

The `.deb` is written under `apps/desktop/src-tauri/target/release/bundle/deb/`. Install it using Ubuntu's installer or `sudo apt install ./path/to/Flow_0.1.0_amd64.deb` (use the actual generated filename). It adds `flow-desktop` to your PATH and Flow to the application launcher.

## Ubuntu shortcuts and automatic paste

Flow configures **Right Alt** when it starts: press once to record, then press again to finish and paste. The existing Flow binding is updated in place, replacing Ctrl+Alt+Space. Other applications’ shortcuts are preserved. If setup fails, use **Settings → Ubuntu desktop setup → Enable shortcut** to see the error and retry.

The shortcut uses GNOME’s physical Right Alt key binding (`0x6c`) on both Wayland and X11. The command points to the current executable, including during development. Tauri’s single-instance plugin forwards `toggle` to the running app. Right Alt is dedicated to dictation, including on keyboards where it is labelled AltGr.

### Wayland paste

Wayland automatic paste uses **wl-copy + ydotool**. Both Ubuntu's symbolic `ydotool 0.1.x` syntax and recent raw-keycode syntax are supported. Text travels through stdin, never a shell command. `ydotoold` must be running with access to `/dev/uinput`. If your prototype already pastes successfully, keep its working service setup.

If no service exists, a user service can be installed as follows (the user must already have access to `/dev/uinput`):

```sh
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/ydotoold.service <<'SERVICE'
[Unit]
Description=Input service for personal dictation
After=graphical-session.target

[Service]
ExecStart=/usr/bin/ydotoold
Restart=on-failure
RestartSec=1

[Install]
WantedBy=default.target
SERVICE
systemctl --user daemon-reload
systemctl --user enable --now ydotoold.service
```

If the device cannot be opened, check your existing Ubuntu input-device permissions with an administrator. Flow does not grant device access or change system permissions. Settings checks the running daemon, but only an actual paste test establishes that your service, socket, and device permissions work together.

**Keep the intended text field focused.** Wayland does not expose a general API for identifying another app's focused text field. Flow's overlay is non-focusable and never intentionally grabs focus; when you switch apps while recording, Wayland paste goes to the field focused at the end. In terminals or apps with a different paste shortcut, disable automatic paste and paste manually. A successful helper exit means a paste key was sent, not that another app acknowledged insertion.

### X11

The same GNOME Right Alt shortcut applies. Insertion uses `xclip` and `xdotool`. It compares the focused window with the original target before sending Ctrl+V; if focus changed, the transcript stays on the clipboard instead.

The transcript remains on your clipboard after copying/pasting. Flow does not race the target app by immediately restoring the previous clipboard.

## Text cleanup with DeepSeek

1. Open **Settings → Text cleanup** and save your DeepSeek API key.
2. Turn on **Recording preferences → Clean up dictation**, then **Save preferences**.
3. Dictate normally. Flow transcribes with Deepgram, cleans the final text with DeepSeek, then pastes.

Uses DeepSeek V4.1 Flash (`deepseek-flash`) at `https://api.deepseek.com/responses` with the OpenAI Responses format. Reasoning is disabled for latency. The prompt removes fillers and accidental repetitions, repairs punctuation and grammar, and asks the model to preserve meaning, language, names, and numbers without answering dictated questions. Only the current transcript and cleanup instructions go to DeepSeek.

The original transcript remains expandable and copyable in Flow and, when local history is enabled, in History. Timeout, missing key, incomplete/empty output, and provider errors fall back to the original with a notification. Cleanup has a 15-second overall deadline and no automatic retries. Cancel during cleanup discards the recording before insertion. Microphone tests never call either provider. Cleanup is off until enabled; removing its key while enabled results in an original-text fallback.

No builds, automated tests, or live provider calls were run for this addition; exercise it in your dev session with your own key.

## Everyday behavior

- The bottom-centered overlay shows an audio-driven signal, cancel, and finish controls, with distinct processing and recovery states. Capture begins immediately and buffers speech in memory while Deepgram connects. Reduced-motion preferences are respected.
- Local silence detection is on by default: a 320 ms lead-in and 800 ms tail protect word boundaries. Long pauses send a lightweight keepalive every four seconds instead of audio. Disable **Detect speech locally** in Settings if quiet speech is missed.
- Streaming reads, uploads, and controls run independently with bounded queues. Stop drains captured speech before final confirmation; interrupted transcripts remain available to copy. The maximum recording duration remains ten minutes.
- Stop flushes the audio tail and waits for Deepgram's final metadata; pauses do not end your session.
- Cancel releases the microphone and discards the active transcript. A late cancellation during delivery prevents paste when it has not yet been sent; copied clipboard content can remain.
- Network, microphone, or finalization errors never cause automatic insertion. Received text remains in Flow for manual recovery.
- In-app recordings stay in the workspace; recordings started from the shortcut or tray use the clipboard/paste setting.
- History keeps the latest 200 successful dictations. Turn it off or delete individual/all entries. Turning it off does not remove older entries.
- Vocabulary entries are Deepgram keyterm hints, not a rewrite or replacement engine.
- Sessions stop at 10 minutes. Microphone tests stop at 30 seconds.

## Development and verification

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm check:rust
pnpm test:rust
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
```

Browser tests use an installed Google Chrome when available, otherwise Playwright Chromium (`pnpm --filter @flow/desktop exec playwright install chromium`). They check navigation, secret-input handling, preferences, empty states, overlay transparency, and the minimum desktop layout. Local Rust WebSocket tests use synthetic audio and never call Deepgram.

Live recognition requires your own funded Deepgram key. Browser tests do not prove microphone access, compositor focus behavior, or delivery into another app. Those require a native acceptance run on your Ubuntu desktop.

## Understand the code

See [the architecture notes](docs/architecture.md) for the recording lifecycle, boundaries, library choices, and a plain-language guide to each Rust module. [PRODUCT.md](PRODUCT.md) records the product scope and [DESIGN.md](DESIGN.md) records the visual system.

The native acceptance run on Ubuntu 24.04 also checked real microphone capture, saved-key authentication, generated speech through the native recording buttons, and external insertion into a separate GTK text field. See the dated verification notes in `docs/architecture.md`. The optional native Rust smoke tests are deliberately ignored by default; run them only when you want microphone access and a real Deepgram request:

```sh
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml native_ -- --ignored --nocapture
```

## Design system

The desktop uses a graphite and neutral charcoal theme, semantic Tailwind v4 tokens in `apps/desktop/src/design-system/tokens.css`, typed button variants in `recipes.ts`, and shared Radix controls. `DESIGN.md` documents the system. The VAD dependency requires Rust 1.87 or newer.
