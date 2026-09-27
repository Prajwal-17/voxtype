import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nativeTheme } from '../src/native';
import { color, typography } from '../src/tokens';

const css = readFileSync(fileURLToPath(new URL('../src/web.css', import.meta.url)), 'utf8');
const kebabCase = (value: string) =>
  value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

describe('web token adapter', () => {
  it('exports every canonical color as a CSS custom property', () => {
    for (const [name, value] of Object.entries(color)) {
      expect(css).toContain(`--palette-${kebabCase(name)}: ${value};`);
    }
  });

  it('keeps every typography role available to Tailwind', () => {
    for (const [name, value] of Object.entries(typography)) {
      expect(css).toContain(`--text-${name}: ${String(value.fontSize / 16)}rem;`);
      expect(css).toContain(`--text-${name}--line-height: ${String(value.lineHeight)};`);
    }
  });
});

describe('native token adapter', () => {
  it('preserves semantic color roles and accessible touch metrics', () => {
    expect(nativeTheme.colors.primary).toBe(color.accent);
    expect(nativeTheme.colors.onPrimary).toBe(color.inverse);
    expect(nativeTheme.colors.background).toBe(color.canvas);
    expect(nativeTheme.control.minimumTouchTarget).toBeGreaterThanOrEqual(44);
  });

  it('maps every typography role to an absolute native line height', () => {
    for (const [name, value] of Object.entries(nativeTheme.typography)) {
      expect(name in typography).toBe(true);
      expect(value.lineHeight).toBeGreaterThanOrEqual(value.fontSize);
    }
  });
});
