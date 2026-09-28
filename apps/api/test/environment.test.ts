import { describe, expect, it } from 'vitest';
import { apiEnvironment } from '../src/shared/runtime/environment';

describe('apiEnvironment', () => {
  it('treats loopback URLs as development', () => {
    expect(apiEnvironment('http://localhost:8787')).toBe('development');
    expect(apiEnvironment('http://127.0.0.1:8787')).toBe('development');
  });

  it('fails closed to production for remote or invalid URLs', () => {
    expect(apiEnvironment('https://api.voxtype.example')).toBe('production');
    expect(apiEnvironment('not-a-url')).toBe('production');
  });
});
