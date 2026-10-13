# Shared

`theme.ts` supplies desktop and mobile theme values; `analytics.ts` supplies shared
analytics contracts and number formatting. Import theme values from `@voxtype/shared`
and web styles from `@voxtype/shared/web.css`. Keep UI components in each app.

After changing the theme, regenerate CSS and Android colors from the repository root:

```sh
pnpm exec turbo run generate --filter=@voxtype/shared
```

Lint checks that generated files are current.
