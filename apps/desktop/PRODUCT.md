# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

VoxType is for people on Ubuntu who dictate text while working across desktop applications. The core job is to start recording quickly, speak naturally, and deliver a usable transcript to the app that already has focus.

## Product Purpose

VoxType is a personal desktop dictation utility. It streams microphone audio to Deepgram, optionally cleans the finished transcript with DeepSeek, and copies or pastes the result into the user's active application. Success means recording is easy to start and stop, state is always obvious, and the result is recoverable.

## Positioning

VoxType combines an app-level recording workspace with a system-wide Right Alt shortcut and compact overlay, so dictation can begin and finish without leaving the destination application.

## Operating Context

- The primary environment is an Ubuntu desktop wrapped with Tauri.
- Production and development can run together: development is a separately named and identified app with isolated credentials, settings, history, backend, and shortcut.
- Users can record from the main Dictation page or through a configurable global shortcut.
- The compact overlay communicates recording, finishing, success, and failure states while another app has focus.
- History, diagnostics, API key setup, language, microphone, voice detection, cleanup, and paste behavior are managed inside the app.

## Capabilities and Constraints

- The desktop workspace requires Google sign-in through the system browser; the resulting VoxType session is stored in the operating-system keyring.
- Microphone audio is streamed to Deepgram for transcription.
- Finished text can optionally be sent to DeepSeek for cleanup.
- API keys are stored in the operating-system keyring.
- Production defaults to Right Alt and development defaults to Ctrl Shift Space; each can be changed independently.
- Up to 200 transcripts can be stored locally; there is no cloud sync.
- The browser build is a preview and cannot record.
- The redesign must preserve current behavior and use the existing React, Tailwind CSS, Radix/shadcn-style component, TanStack Query, Motion, and Tauri stack.

## Brand Commitments

- Product name: VoxType.
- Voice: concise, calm, direct, and operational.
- The user requested a simple, clean, usable, premium application UI, a new palette centralized in global CSS, Tailwind throughout, and shadcn components as the base.

## Evidence on Hand

- Product behavior and setup: `../../README.md`.
- Existing workflows and states: `src/App.tsx`, `src/pages/History.tsx`, `src/pages/Settings.tsx`, and `src/components/overlay.tsx`.
- No testimonials, usage claims, commercial claims, or external brand assets are available and none should be invented.

## Product Principles

- Recording state must be unmistakable at a glance.
- Dictation should feel immediate and stay out of the user's way.
- Privacy and local-storage boundaries should be understandable without alarmist copy.
- Every transcript should be recoverable, copyable, and easy to find.
- Settings should favor scanability and confidence over density.

## Accessibility & Inclusion

Preserve keyboard access, semantic controls, visible focus, reduced-motion support, status announcements, sufficient color contrast, and usable compact layouts.
