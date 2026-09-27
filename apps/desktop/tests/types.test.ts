import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  duration,
  isActive,
  parseVocabulary,
  settingsSchema,
} from '../src/lib/types';
describe('preferences boundary', () => {
  it('rejects unsupported languages and excessive vocabulary', () => {
    expect(settingsSchema.safeParse({ ...defaultSettings, language: 'invented' }).success).toBe(
      false,
    );
    expect(
      settingsSchema.safeParse({ ...defaultSettings, vocabulary: Array(101).fill('name') }).success,
    ).toBe(false);
  });
  it('preserves phrases and punctuation while removing blank lines and duplicates', () => {
    expect(parseVocabulary('  R&D\nCloudflare Workers\n\nR&D\n')).toEqual([
      'R&D',
      'Cloudflare Workers',
    ]);
  });
  it('does not treat errors or finished dictations as recording', () => {
    expect(isActive('error')).toBe(false);
    expect(isActive('done')).toBe(false);
    expect(isActive('finishing')).toBe(true);
    expect(duration(61000)).toBe('1:01');
  });
});
