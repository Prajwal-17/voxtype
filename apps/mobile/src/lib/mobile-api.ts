import type { Analytics } from '@voxtype/shared/analytics';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import VoxTypeNative from '../../modules/voxtype-native/src/VoxTypeNativeModule';

const configuredApiUrl: unknown = process.env.EXPO_PUBLIC_API_URL;
export const API_URL = (
  typeof configuredApiUrl === 'string' && configuredApiUrl
    ? configuredApiUrl
    : 'https://voxtype-api-production.prajwalreddy-dev.workers.dev'
).replace(/\/$/, '');
const REDIRECT_URL = 'voxtype://auth/callback';

export type User = { id: string; name: string; email: string; image: string | null };

export async function currentUser(): Promise<User | null> {
  const { token } = await VoxTypeNative.getSession();
  if (!token) return null;
  const response = await fetch(`${API_URL}/v1/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) {
    await VoxTypeNative.signOut();
    return null;
  }
  if (!response.ok) throw new Error('Could not verify your account. Check your connection.');
  const body = (await response.json()) as { data: User };
  return body.data;
}

export async function signIn(): Promise<User> {
  const state = Crypto.randomUUID();
  const result = await WebBrowser.openAuthSessionAsync(
    `${API_URL}/api/mobile-auth/start?state=${encodeURIComponent(state)}`,
    REDIRECT_URL,
  );
  if (result.type !== 'success') throw new Error('Google sign-in was not completed.');
  const callback = new URL(result.url);
  if (
    `${callback.protocol}//${callback.host}${callback.pathname}` !== REDIRECT_URL ||
    callback.searchParams.get('state') !== state
  ) {
    throw new Error('Sign-in response could not be verified. Try again.');
  }
  if (callback.searchParams.has('error')) throw new Error('This Google account could not sign in.');
  const grant = callback.searchParams.get('token');
  if (!grant) throw new Error('Sign-in link expired. Try again.');
  return exchangeGrant(grant);
}

/** Exchange the single-use grant from `voxtype://auth/callback` for a native session. */
export async function exchangeGrant(grant: string): Promise<User> {
  const response = await fetch(`${API_URL}/api/auth/one-time-token/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: grant }),
  });
  const bearer = response.headers.get('set-auth-token');
  if (!response.ok || !bearer) throw new Error('Sign-in link expired. Try again.');
  const body = (await response.json()) as { user: User };
  await VoxTypeNative.setSession(bearer, body.user.id, API_URL);
  return body.user;
}

export async function signOut(): Promise<void> {
  const { token } = await VoxTypeNative.getSession();
  if (token) {
    try {
      await fetch(`${API_URL}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: API_URL,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
    } catch {
      /* local sign-out still revokes this device's credential */
    }
  }
  await VoxTypeNative.signOut();
}

export async function getAnalytics(): Promise<Analytics> {
  const { token } = await VoxTypeNative.getSession();
  if (!token) throw new Error('Sign in again');
  const response = await fetch(`${API_URL}/v1/analytics?range=30d`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Analytics unavailable');
  return ((await response.json()) as { data: Analytics }).data;
}
