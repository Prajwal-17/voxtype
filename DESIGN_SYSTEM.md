# Visual foundation

VoxType uses the refined Still design: light surfaces, petrol green actions, compact spacing, and thin borders.
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

## Refined Still

Canvas `#fbfcfa`, surface `#ffffff`, navigation `#f0f3ef`, ink `#23332d`, muted
`#606e66`, separators `#dde4dd`, accent `#275a49`. Panels use 12px corners;
controls use 8px corners. Mona Sans is used for every heading and body role.
Regular panels have no elevation. Floating recorders use `#203d33`, fully rounded
ends and `#abd7ad` real audio waveforms. They have no microphone tile or timer.

Desktop uses a 174px sidebar (158px at intermediate widths), 22 × 26px main
padding and four primary destinations. Mobile uses four labeled native tabs and
separate Account access, safe areas and 44–48dp controls. Home puts Dictation
before the overview and recent transcripts. Transcripts expand inline.

Insights has a divided metric strip, supporting totals, a fixed 14 × 7 activity
grid, bounded trend marks, definitions and native CSV export. The desktop calendar
has roving arrow-key focus; mobile exposes a single adjustable summary plus full-size
previous/next day actions. Do not add app-destination tracking or decorative statistics.
