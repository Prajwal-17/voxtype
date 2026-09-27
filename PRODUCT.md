# Flow

<!-- impeccable:product-schema 1 -->

## Platform

web
React UI in a native Tauri desktop application, Ubuntu first.

## Stack

User-selected Tauri, React, Tailwind, TanStack Query. Native Rust kept small and documented. No Cloudflare backend. Optional DeepSeek V4.1 Flash cleans finalized transcripts before insertion through the OpenAI Responses format.

## Users

A personal daily dictation utility used while writing in other desktop applications. The owner understands JavaScript better than Rust.

## Product Purpose

Start from a shortcut, speak, see a non-focusing voice overlay, stop, and insert the transcript at the cursor. Recover text when insertion or networking fails.

## Capabilities and Constraints

Direct Deepgram streaming with a user-entered API key in the OS keyring. Local embedded neural VAD suppresses sustained silence before upload and keeps speech lead-in/tail in memory. Ubuntu Wayland and X11 need explicit native integration and diagnostics. No raw audio persistence. Local history can be disabled and cleared. Future mobile and cloud sync are out of scope.

## Brand Commitments

Flow. User requested a complete redesign of the earlier olive/ivory workspace: graphite navigation, a restrained neutral charcoal accent, clean transcript workspace, shared variable-based design tokens, and rich real microphone-driven overlay animation. Direct implementation in code.

## Product Principles

Immediate capture; no lost opening words. No automatic insertion of incomplete text. No pretend success. Discoverable recovery. No unnecessary motion on frequently repeated actions.

## Explicit UI correction

The user rejected marketing slogans and decorative generated copy. Use direct operational labels and concise instructions throughout.
