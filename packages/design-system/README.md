# @flow/design-system

Shared visual foundations for every VoxType client.

- Import `@flow/design-system/web.css` after Tailwind in web or desktop apps.
- Import tokens from `@flow/design-system` in platform-neutral TypeScript.
- Import `nativeTheme` from `@flow/design-system/native` in Expo or React Native.

The package intentionally shares tokens and semantic roles, not rendered components. Desktop components remain Radix/shadcn-based; mobile components should use native navigation, controls, sheets, safe areas, and touch behavior.

See [`../../DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md) for the complete contract.
