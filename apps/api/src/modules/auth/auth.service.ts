import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { oneTimeToken } from 'better-auth/plugins/one-time-token';
import { ApiError } from '../../shared/errors/api-error';
import { apiEnvironment } from '../../shared/runtime/environment';
import { createAuthRepository } from './auth.repository';
import type { BackgroundContext, DesktopAuthCallback } from './auth.types';
import { normalizeEmail, parseCommaSeparated } from './auth.utils';

export function createAuthService(env: Env, executionContext?: BackgroundContext) {
  const allowedEmail = normalizeEmail(env.ALLOWED_EMAIL);

  return betterAuth({
    appName: apiEnvironment(env.API_URL) === 'development' ? 'VoxType Dev' : 'VoxType',
    baseURL: env.API_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: createAuthRepository(env.DB),
    trustedOrigins: [env.API_URL, ...parseCommaSeparated(env.CLIENT_ORIGINS)],
    user: {
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
      validateUserInfo: ({ user, source }) => {
        const isAllowedGoogleAccount =
          source.method === 'oauth' &&
          source.oauth?.providerId === 'google' &&
          user.email !== undefined &&
          normalizeEmail(user.email) === allowedEmail;

        if (!isAllowedGoogleAccount) {
          return {
            error: 'email_not_allowed',
            errorDescription: 'This VoxType account is private.',
          };
        }
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: 'select_account',
        requireEmailVerification: true,
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
    },
    plugins: [
      bearer({ requireSignature: true }),
      oneTimeToken({ disableClientRequest: true, expiresIn: 2, storeToken: 'hashed' }),
    ],
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
      },
      database: {
        generateId: 'uuid',
        joins: false,
      },
      backgroundTasks: executionContext
        ? {
            handler: (promise) => executionContext.waitUntil(promise),
          }
        : undefined,
    },
  });
}

export async function startDesktopSignIn(
  env: Env,
  executionContext: BackgroundContext,
  headers: Headers,
  callback: DesktopAuthCallback,
): Promise<Response> {
  const callbackUrl = new URL('/api/desktop-auth/callback', env.API_URL);
  callbackUrl.searchParams.set('port', String(callback.port));
  callbackUrl.searchParams.set('state', callback.state);

  const response = await createAuthService(env, executionContext).api.signInSocial({
    headers,
    body: {
      provider: 'google',
      callbackURL: callbackUrl.toString(),
      errorCallbackURL: callbackUrl.toString(),
      disableRedirect: true,
    },
    asResponse: true,
  });
  const body: unknown = await response.json();
  const authorizationUrl =
    typeof body === 'object' && body !== null && 'url' in body && typeof body.url === 'string'
      ? body.url
      : null;

  if (!authorizationUrl) {
    throw new ApiError(502, 'oauth_start_failed', 'Google sign-in could not be started.');
  }

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('location', authorizationUrl);
  responseHeaders.delete('content-length');
  responseHeaders.delete('content-type');
  return new Response(null, { status: 302, headers: responseHeaders });
}

export async function finishDesktopSignIn(
  env: Env,
  executionContext: BackgroundContext,
  headers: Headers,
  callback: DesktopAuthCallback & { oauthError?: string },
): Promise<string> {
  const loopbackUrl = new URL(`http://127.0.0.1:${callback.port}/callback`);
  loopbackUrl.searchParams.set('state', callback.state);

  if (callback.oauthError) {
    loopbackUrl.searchParams.set(
      'error',
      callback.oauthError === 'email_not_allowed' ? 'account_not_allowed' : 'sign_in_failed',
    );
    return loopbackUrl.toString();
  }

  const auth = createAuthService(env, executionContext);
  const session = await auth.api.getSession({ headers });
  if (!session) {
    loopbackUrl.searchParams.set('error', 'sign_in_failed');
    return loopbackUrl.toString();
  }

  const { token } = await auth.api.generateOneTimeToken({ headers });
  loopbackUrl.searchParams.set('token', token);
  return loopbackUrl.toString();
}

/** The OAuth callback is fixed server-side; only the one-time grant reaches the app. */
export async function startMobileSignIn(
  env: Env,
  executionContext: BackgroundContext,
  headers: Headers,
  state: string,
): Promise<Response> {
  const callbackUrl = new URL('/api/mobile-auth/callback', env.API_URL);
  callbackUrl.searchParams.set('state', state);
  const response = await createAuthService(env, executionContext).api.signInSocial({
    headers,
    body: {
      provider: 'google',
      callbackURL: callbackUrl.toString(),
      errorCallbackURL: callbackUrl.toString(),
      disableRedirect: true,
    },
    asResponse: true,
  });
  const body: unknown = await response.json();
  const url =
    typeof body === 'object' && body !== null && 'url' in body && typeof body.url === 'string'
      ? body.url
      : null;
  if (!url) throw new ApiError(502, 'oauth_start_failed', 'Google sign-in could not be started.');
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('location', url);
  responseHeaders.delete('content-length');
  responseHeaders.delete('content-type');
  return new Response(null, { status: 302, headers: responseHeaders });
}

export async function finishMobileSignIn(
  env: Env,
  executionContext: BackgroundContext,
  headers: Headers,
  state: string,
  oauthError?: string,
): Promise<string> {
  const callbackUrl = new URL('voxtype://auth/callback');
  callbackUrl.searchParams.set('state', state);
  if (oauthError) {
    callbackUrl.searchParams.set(
      'error',
      oauthError === 'email_not_allowed' ? 'account_not_allowed' : 'sign_in_failed',
    );
    return callbackUrl.toString();
  }
  const auth = createAuthService(env, executionContext);
  const session = await auth.api.getSession({ headers });
  if (!session) {
    callbackUrl.searchParams.set('error', 'sign_in_failed');
    return callbackUrl.toString();
  }
  const { token } = await auth.api.generateOneTimeToken({ headers });
  callbackUrl.searchParams.set('token', token);
  return callbackUrl.toString();
}
