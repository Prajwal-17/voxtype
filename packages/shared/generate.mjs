import process from 'node:process';
import { URL } from 'node:url';
import { color, fontFamily, typography, radius, shadow, easing } from './theme.ts';
import { readFileSync, writeFileSync } from 'node:fs';
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
const lines = Object.entries(color).map(([key, value]) => `  --palette-${kebab(key)}: ${value};`);
const aliases = { surfaceSubtle: 'subtle', surfaceRaised: 'raised' };
const theme = [
  `  --font-sans: ${fontFamily.web};`,
  ...Object.keys(color).map(
    (key) => `  --color-${aliases[key] ?? kebab(key)}: var(--palette-${kebab(key)});`,
  ),
  ...Object.entries(typography).flatMap(([key, value]) => [
    `  --text-${key}: ${value.fontSize / 16}rem;`,
    `  --text-${key}--line-height: ${value.lineHeight};`,
  ]),
  ...Object.entries(radius).map(([key, value]) => `  --radius-${kebab(key)}: ${value / 16}rem;`),
  ...Object.entries(shadow).map(([key, value]) => `  --shadow-${key}: ${value};`),
  `  --ease-responsive: ${easing.responsive};`,
];
const css = `/* Generated from theme.ts. Run pnpm --filter @voxtype/shared generate. */\n:root {\n${lines.join('\n')}\n}\n\n@theme inline {\n${theme.join('\n')}\n}\n`;
const kotlin = `// Generated from packages/shared/theme.ts. Do not edit.\npackage com.voxtype.nativebridge\n\nobject VoxTheme {\n${Object.entries(
  color,
)
  .map(([key, value]) => `  val ${key} = 0xFF${value.slice(1).toUpperCase()}.toInt()`)
  .join('\n')}\n}\n`;
for (const [name, output] of [
  ['./web.css', css],
  [
    '../../apps/mobile/modules/voxtype-native/android/src/main/java/com/voxtype/nativebridge/VoxTheme.kt',
    kotlin,
  ],
]) {
  const path = new URL(name, import.meta.url);
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== output)
      throw new Error(`${name} is stale. Run pnpm --filter @voxtype/shared generate.`);
  } else writeFileSync(path, output);
}
