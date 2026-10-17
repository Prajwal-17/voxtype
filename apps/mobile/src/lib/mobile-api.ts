import { clientTimezone, type AnalyticsRange, type Analytics } from '@voxtype/shared/analytics';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import VoxTypeNative from '../../modules/voxtype-native/src/VoxTypeNativeModule';
import { createAuthCompletion } from './auth-completion';
import { resolveApiUrl } from './environment';
import { mobileAuthVariant } from './auth-variant';
import { parseAnalyticsResponse } from './analytics-response';

export const API_URL = resolveApiUrl(process.env.EXPO_PUBLIC_API_URL, __DEV__);

export type User = { id: string; name: string; email: string; image: string | null };

export async function currentUser(): Promise<User | null> {
  const { token, userId } = await VoxTypeNative.getSession();
  if (!token) return null;
  const response = await fetch(`${API_URL}/v1/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const current = await VoxTypeNative.getSession();
  if (current.token !== token || current.userId !== userId) throw new Error('Account changed');
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
  authCompletion.reset();
  await VoxTypeNative.setAuthState(state);
  const snapshot = await VoxTypeNative.getSnapshot();
  const { variant, callbackUrl } = mobileAuthVariant(snapshot.appHealth?.packageName);
  const result = await WebBrowser.openAuthSessionAsync(
    `${API_URL}/api/mobile-auth/start?${new URLSearchParams({ state, variant }).toString()}`,
    callbackUrl,
  );
  if (result.type !== 'success') {
    const pending = authCompletion.resultFor(state);
    if (pending) return pending;
    throw new Error('Google sign-in was not completed.');
  }
  const callback = new URL(result.url);
  if (
    `${callback.protocol}//${callback.host}${callback.pathname}` !== callbackUrl ||
    callback.searchParams.get('state') !== state
  ) {
    throw new Error('Sign-in response could not be verified. Try again.');
  }
  return completeAuth(
    callback.searchParams.get('state') ?? undefined,
    callback.searchParams.get('token') ?? undefined,
    callback.searchParams.get('error') ?? undefined,
  );
}

const authCompletion = createAuthCompletion<User>({
  pendingState: () => VoxTypeNative.getAuthState(),
  exchange: exchangeGrant,
});
export const completeAuth = authCompletion.complete;

/** Exchange the single-use grant from `voxtype://auth/callback` for a native session. */
async function exchangeGrant(grant: string): Promise<User> {
  const state = await VoxTypeNative.getAuthState();
  const response = await fetch(`${API_URL}/api/auth/one-time-token/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: grant }),
  });
  const bearer = response.headers.get('set-auth-token');
  if (!response.ok || !bearer) throw new Error('Sign-in link expired. Try again.');
  const body = (await response.json()) as { user: User };
  if (!state || state !== (await VoxTypeNative.getAuthState())) {
    throw new Error('Sign-in attempt changed. Try again.');
  }
  await VoxTypeNative.setSession(bearer, body.user.id, API_URL);
  return body.user;
}

export async function signOut(): Promise<void> {
  authCompletion.reset();
  await VoxTypeNative.setAuthState('');
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

export async function getAnalytics(
  range: AnalyticsRange = '30d',
  timezone = clientTimezone(),
  signal?: AbortSignal,
  expectedUserId?: string,
): Promise<Analytics> {
  const { token, userId } = await VoxTypeNative.getSession();
  if (!token || (expectedUserId && userId !== expectedUserId)) throw new Error('Sign in again');
  const response = await fetch(
    `${API_URL}/v1/analytics?${new URLSearchParams({ range, timezone }).toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    },
  );
  if (!response.ok) throw new Error('Analytics unavailable');
  const body: unknown = await response.json();
  const current = await VoxTypeNative.getSession();
  if (current.token !== token || current.userId !== userId) throw new Error('Account changed');
  return parseAnalyticsResponse(body);
}

export async function exportInsights(
  range: AnalyticsRange,
  timezone = clientTimezone(),
): Promise<void> {
  const { token, userId } = await VoxTypeNative.getSession();
  if (!token) throw new Error('Sign in again');
  const response = await fetch(
    `${API_URL}/v1/analytics?${new URLSearchParams({ range, timezone, format: 'csv' }).toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error('Couldn’t export insights');
  const csv = await response.text();
  if (csv.length > 8_000_000) throw new Error('Export exceeds the file limit');
  const current = await VoxTypeNative.getSession();
  if (current.userId !== userId || current.token !== token)
    throw new Error('Account changed. Try again.');
  await VoxTypeNative.shareInsights(csv);
}
