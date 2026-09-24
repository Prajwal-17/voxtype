# Flow

Lightweight Ubuntu dictation, built with Neutralino.js and TypeScript in a pnpm/Turborepo workspace.

**Status: feasibility prototype; not a working dictation MVP yet.** The stock Neutralino 6.9.0 Linux webview has no microphone permission handler. The approved plan requires resolving this before implementing the full workflow. See [the feasibility report](docs/feasibility.md).

## Run the diagnostic on Ubuntu 24.04

Prerequisites: Node.js 22.12+ (Node 24 recommended), pnpm 10.30.3, and a local graphical desktop session. Run these from the repository root:

```sh
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

1. Click **Test microphone** with the key blank. Record the displayed result. Finish releases the microphone.
2. If microphone access succeeds, optionally enter your own Deepgram key and repeat. Speaking streams audio to Deepgram; Finish flushes the stream. Recording automatically stops after 60 seconds.
3. Click **Test overlay focus**, focus a browser/editor text field during the delay, and keep typing. Note whether showing the overlay takes focus. Repeat in each target app.
4. Click **Test paste**, then focus a disposable field. This replaces the clipboard with `Flow paste test` and attempts Ctrl+V. It never presses Enter.

The key is used only in memory and cleared from the input when a session starts. Do not commit keys. No audio or transcript history is saved. This diagnostic intentionally does not auto-paste Deepgram transcripts.

`pnpm dev` is a browser-only UI preview. Browser microphone success does **not** validate Neutralino's WebKit integration.

## Workspace

- `apps/desktop`: Neutralino runtime configuration, Vite, diagnostic UI and platform probes.
- `packages/core`: platform-independent dictation contracts; session implementation is pending the gate.
- `packages/config`: shared strict TypeScript configuration.

```sh
pnpm typecheck
pnpm build
```

Node.js, pnpm, Vite and Turbo are development tools; they are not intended to run in the installed desktop app. No Expo app, Rust service, or Node.js background service is included.

## Next milestone

Resolve microphone capture and validate a non-focusing overlay on the target machine. Then implement single-instance shortcut IPC, session tests, keyring settings, automatic paste, launch-at-login and release packaging. These are deliberately not represented as completed by this prototype.

A CI workflow template is in `docs/ci-check.yml`. To enable GitHub Actions, move it to `.github/workflows/check.yml` using a GitHub login with workflow-write permission. The login used for this implementation cannot publish workflow files.
