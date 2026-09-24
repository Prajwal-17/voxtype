# Flow

Lightweight Ubuntu dictation, built with Neutralino.js and TypeScript in a pnpm/Turborepo workspace.

**Status: Linux capture prototype; full desktop integration is still in progress.** Microphone audio now comes from `parec`, bypassing the blocked WebKit permission path. Overlay focus still needs verification on the target desktop. See [the feasibility report](docs/feasibility.md).

## Run the diagnostic on Ubuntu 24.04

Prerequisites: Node.js 22.12+ (Node 24 recommended), pnpm 10.30.3, and a local graphical desktop session. Run these from the repository root:

```sh
sudo apt install pulseaudio-utils
pnpm install --frozen-lockfile
pnpm runtime:download
pnpm probe
```

If native libraries are missing:

```sh
sudo apt install libgtk-3-0t64 libwebkit2gtk-4.1-0 libxtst6
```

Optional tools for the paste/dependency diagnostics:

```sh
sudo apt install wl-clipboard ydotool libsecret-tools
```

Installing ydotool alone may not configure its daemon or `/dev/uinput` access. This prototype does not change device permissions, install a privileged service, or register global shortcuts. A failed paste test may indicate missing daemon access rather than a transcription problem.

1. Click **Test microphone** with the key blank. Speak and check the level meter. Capture uses the default input selected in Ubuntu Settings → Sound (including PipeWire through its PulseAudio compatibility server). No browser permission dialog is expected. Finish releases the microphone.
2. If microphone access succeeds, optionally enter your own Deepgram key and repeat. Speaking streams audio to Deepgram; Finish flushes the stream. Recording automatically stops after 60 seconds.
3. Click **Test overlay focus**, focus a browser/editor text field during the delay, and keep typing. Note whether showing the overlay takes focus. Repeat in each target app.
4. Click **Test paste**, then focus a disposable field. This replaces the clipboard with `Flow paste test` and attempts Ctrl+V. It never presses Enter.

The key is used only in memory and cleared from the input when a session starts. Do not commit keys. No audio or transcript history is saved. This diagnostic intentionally does not auto-paste Deepgram transcripts.

`pnpm dev` is a browser-only UI preview. Native capture requires `pnpm probe`; it is unavailable in the browser-only preview.

## Workspace

- `apps/desktop`: Neutralino runtime configuration, Vite, diagnostic UI and platform probes.
- `packages/core`: platform-independent dictation contracts; session implementation is pending the gate.
- `packages/config`: shared strict TypeScript configuration.

```sh
pnpm typecheck
pnpm test
pnpm build
```

Node.js, pnpm, Vite and Turbo are development tools; they are not intended to run in the installed desktop app. No Expo app, Rust service, or Node.js background service is included.

## Next milestone

Verify the new Linux capture path and a non-focusing overlay on the target machine. Then implement single-instance shortcut IPC, session tests, keyring settings, automatic paste, launch-at-login and release packaging. These are deliberately not represented as completed by this prototype.

A CI workflow template is in `docs/ci-check.yml`. To enable GitHub Actions, move it to `.github/workflows/check.yml` using a GitHub login with workflow-write permission. The login used for this implementation cannot publish workflow files.

## Linux capture troubleshooting

- `Missing parec`: run `sudo apt install pulseaudio-utils`.
- `Connection refused` or audio-server errors: run Flow as your normal desktop user, not with sudo or from SSH. Check `pactl info` and Ubuntu Sound input.
- A flat meter: choose the correct default microphone in Ubuntu Sound and check mute/input volume.
- The key is still entered in the app for each Deepgram test; no `.env` is needed.

The capture wrapper is bundled as text with the app. It starts `parec` and a base64 encoder only during recording, decodes 16 kHz mono signed PCM in TypeScript, and sends binary audio to Deepgram. Finish drains the final audio before closing the stream; Cancel discards it. Closing the window waits for cleanup. EOF and a 65-second safety limit also release the helper processes. No custom Node or Rust runtime is used.
