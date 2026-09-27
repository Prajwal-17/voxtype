import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { createAuthRepository } from './auth.repository';
import type { BackgroundContext } from './auth.types';
import { normalizeEmail, parseCommaSeparated } from './auth.utils';

export function createAuthService(env: Env, executionContext?: BackgroundContext) {
  const allowedEmail = normalizeEmail(env.ALLOWED_EMAIL);
  const googleClientIds = parseCommaSeparated(env.GOOGLE_CLIENT_IDS);

  return betterAuth({
    appName: 'VoxType',
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
        clientId: googleClientIds.length === 1 ? googleClientIds[0]! : googleClientIds,
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
    plugins: [bearer({ requireSignature: true })],
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
