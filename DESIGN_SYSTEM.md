# Visual foundation

VoxType uses one mineral green palette with petrol actions and soft, rounded surfaces.
`packages/shared/theme.ts` is the source for colors, typography, spacing, geometry,
and motion. Names describe purpose (`surface`, `ink`, `accent`), never a trial or city.

- Desktop: local shadcn/Radix components, Phosphor icons, fixed sidebar.
- Mobile: React Native components in `apps/mobile/src/components`, Phosphor icons,
  safe areas, bottom tabs, native switches and virtualized transcript lists.
- Android bubble: generated `VoxTheme.kt` uses the same palette.

Run `pnpm --filter @voxtype/shared generate` after editing the theme. The generated
CSS and Kotlin are checked by lint. Components stay platform-specific; only values
and API contracts are shared.

Use one heading per screen. Keep labels short; show explanation only for permissions,
errors or decisions that need it. Use `Loader` for pending screens. Preserve focus
indicators, 40px desktop controls and 44–48dp touch targets. Use tabular numbers for
metrics. Avoid decorative looping animation; respect reduced motion.

## Brand assets

`assets/logo.svg` is the editable master. `python3 scripts/generate-icons.py`
(requires Pillow) creates desktop PNG/ICO, mobile launcher, adaptive foreground,
monochrome, splash and favicon assets. Android foreground artwork stays inside the
adaptive safe zone. The splash image has an explicit 96dp size. Font provenance is
in `apps/mobile/assets/fonts/PROVENANCE.md`.
