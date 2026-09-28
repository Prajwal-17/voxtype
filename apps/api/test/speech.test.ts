import { describe, expect, it, vi } from 'vitest';
import { cleanTranscript, grantDeepgramToken } from '../src/modules/speech/speech.service';
import { mobileAuthQuerySchema } from '../src/modules/auth/auth.validation';

describe('mobile speech API', () => {
  it('grants a short-lived token without returning the server key', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ access_token: 'temporary', expires_in: 60 }),
    );
    const result = await grantDeepgramToken('server-key', fetcher as typeof fetch);
    expect(result).toEqual({ token: 'temporary', expiresIn: 60 });
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.deepgram.com/v1/auth/grant');
  });

  it('keeps the original transcript when cleanup fails', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    expect(await cleanTranscript('spoken original', 'server-key', fetcher as typeof fetch)).toEqual(
      { text: 'spoken original', cleaned: false },
    );
  });

  it('accepts only a UUID OAuth state', () => {
    expect(
      mobileAuthQuerySchema.safeParse({ state: '7ac72db4-685f-4eb3-bbc4-26756b1f5b38' }).success,
    ).toBe(true);
    expect(mobileAuthQuerySchema.safeParse({ state: 'unsafe' }).success).toBe(false);
  });
});
