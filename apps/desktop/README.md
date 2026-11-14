# VoxType Desktop

Linux dictation app built with Tauri, React, and Rust. Records from a global shortcut
and pastes the transcript into the focused app.

## Setup

Follow the [workspace setup](../../README.md#quick-start) and [API setup](../api/README.md#setup).
Install Rust stable and these Linux build dependencies: `build-essential`, `pkg-config`,
`libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libssl-dev`,
`libdbus-1-dev`, and `patchelf`.

Microphone access uses `pulseaudio-utils`; account storage needs `gnome-keyring`.
Automatic paste uses `xdotool` on X11 or `ydotool` with a running `ydotoold` and
access to `/dev/uinput` on Wayland.

## Microphone selection

The default **Automatic (best available)** mode uses a connected USB or wired
headset microphone and otherwise the laptop microphone. It never changes a
Bluetooth card's profile: earbuds stay in high-quality A2DP playback mode.

The tray menu and Settings also list a **microphone (call mode)** entry for each
connected Bluetooth card that offers a usable headset profile, including a card
currently switched off. Choosing it switches that card to HFP for the dictation
and restores the previous profile (A2DP or off) as soon as capture drains, before
remote finalization. An explicit choice that cannot be used fails with an
actionable message instead of silently using another microphone. HFP capture is
narrowband, and some Linux adapters/kernels corrupt SCO packets or deliver
digital bursts instead of speech. VoxType asks for the more compatible CVSD
codec first, waits for the card and source to settle, buffers Bluetooth capture
more deeply, and ends a take with a clear message if the captured stream
degrades. If that happens, choose Automatic or the laptop microphone; the
platform defect cannot be repaired from the application. See
[audio capture and recovery](../../docs/AUDIO.md).

## Development

With the local API running, start from the repository root:

```sh
pnpm exec turbo run dev --filter=@voxtype/desktop
```

Starts **VoxType Dev** with separate settings and sign-in, using `http://localhost:8787`.
The default shortcut is `Ctrl Shift Space`.

The production shortcut defaults to `Right Alt`. When signed out, it shows a
“Sign in to dictate” overlay instead of opening the microphone. Its sign-in button
opens the main app and dismisses the overlay.

## Build

```sh
VOXTYPE_API_URL=https://api.example.com pnpm exec turbo run build:desktop --filter=@voxtype/desktop
```

Use your production HTTPS API URL. Output: `apps/desktop/src-tauri/target/release/bundle/deb/`.
