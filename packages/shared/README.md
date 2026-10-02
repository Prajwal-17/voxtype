# Shared values

`theme.ts` holds the visual values used by desktop, mobile and the Android bubble.
`analytics.ts` holds their analytics response contract and number formatting.

Import colors or `nativeTheme` from `@voxtype/shared`. Desktop and mobile web import
`@voxtype/shared/web.css`. Run `pnpm --filter @voxtype/shared generate` after a theme
change; lint rejects stale CSS or Kotlin. Keep UI components in each app.
