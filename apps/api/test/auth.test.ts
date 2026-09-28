import { describe, expect, it } from 'vitest';
import {
  desktopAuthCallbackQuerySchema,
  desktopAuthQuerySchema,
} from '../src/modules/auth/auth.validation';

describe('desktop auth callback validation', () => {
  it('accepts a loopback port and cryptographic state', () => {
    expect(
      desktopAuthQuerySchema.safeParse({
        port: '49152',
        state: '7ac72db4-685f-4eb3-bbc4-26756b1f5b38',
      }).success,
    ).toBe(true);
  });

  it('rejects privileged ports and malformed state', () => {
    expect(desktopAuthQuerySchema.safeParse({ port: '80', state: 'unsafe' }).success).toBe(false);
  });

  it('accepts a bounded OAuth error code on the callback', () => {
    expect(
      desktopAuthCallbackQuerySchema.safeParse({
        port: '49152',
        state: '7ac72db4-685f-4eb3-bbc4-26756b1f5b38',
        error: 'email_not_allowed',
      }).success,
    ).toBe(true);
  });
});
