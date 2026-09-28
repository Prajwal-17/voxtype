# VoxType

Personal dictation app. Streams mic audio to Deepgram and pastes the transcript into the focused app. Keys stay in the OS keyring.

## Design system

Shared color, typography, spacing, motion, and component contracts live in [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) and `packages/design-system`. Desktop consumes the Tailwind adapter today; future Expo or React Native clients can consume the native theme from the same package.

## Requirements

Node 24+, pnpm 10, Rust stable, Ubuntu desktop libs:

```sh
sudo apt-get install -y build-essential pkg-config libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev librsvg2-dev libssl-dev libdbus-1-dev \
  pulseaudio-utils wl-clipboard ydotool ydotoold xdotool xclip gnome-keyring
```

## Run

```sh
pnpm install --frozen-lockfile
pnpm dev        # local Worker + isolated VoxType Dev app
pnpm dev:desktop
pnpm dev:api
pnpm dev:web    # browser preview only, no mic
```

With the desktop development app running, `apps/desktop/src-tauri/target/debug/voxtype-desktop preview-overlay`
shows the native overlay for 15 seconds without recording or calling transcription services.
It should stay above other apps at the bottom of the monitor under the pointer, clear of the dock,
without taking keyboard focus or appearing in Alt-Tab. The command is debug-only.

1. Settings → save your Deepgram API key.
2. Start dictation, Finish to copy/paste.

The installed production app defaults to `Right Alt`. VoxType Dev defaults to
`Ctrl Shift Space`. Each shortcut can be changed independently in Settings by choosing a preset
or recording a custom key combination.

Development is intentionally isolated as a second application:

| Surface          | Production              | Development                 |
| ---------------- | ----------------------- | --------------------------- |
| App name         | VoxType                 | VoxType Dev                 |
| Tauri identifier | `com.voxtype.dictation` | `com.voxtype.dictation.dev` |
| API              | `VOXTYPE_API_URL`       | `http://localhost:8787`     |
| Keyring service  | `com.voxtype.dictation` | `com.voxtype.dictation.dev` |
| Local store      | `voxtype.json`          | `voxtype-dev.json`          |
| Global shortcut  | Right Alt               | Ctrl Shift Space            |

If a pre-VoxType-identity build is still installed, remove that build before installing the newly
named production package. The renamed production identity starts with a fresh keyring and local
settings namespace, so sign in and save the desktop preferences once after upgrading.

## Build

```sh
VOXTYPE_API_URL=https://api.example.com pnpm build:desktop
```

`.deb` lands in `apps/desktop/src-tauri/target/release/bundle/deb/`.

## Cloud backend

The sync/auth API lives in [`apps/api`](apps/api). See its README for D1 creation, Google OAuth,
migrations, local development, and deployment.

Production builds require an HTTPS API URL and fail during packaging when it is missing. Development
builds always default to the local Worker:

```sh
VOXTYPE_API_URL=https://api.example.com pnpm build:desktop
pnpm --filter @voxtype/desktop build:desktop:dev
```
