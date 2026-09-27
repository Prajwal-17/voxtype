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
pnpm dev        # native Tauri app
pnpm dev:web    # browser preview only, no mic
```

1. Settings → save your Deepgram API key.
2. Start dictation, Finish to copy/paste.

Press Right Alt to record / finish when running natively.

## Build

```sh
pnpm build:desktop
```

`.deb` lands in `apps/desktop/src-tauri/target/release/bundle/deb/`.

## Cloud backend

The sync/auth API lives in [`apps/api`](apps/api). See its README for D1 creation, Google OAuth,
migrations, local development, and deployment.
