import type { Context } from 'hono';
import type { ApiEnv } from '../../shared/http/api.types';
import { validationError } from '../../shared/http/http.utils';
import { createAuthService, finishDesktopSignIn, startDesktopSignIn } from './auth.service';
import { desktopAuthCallbackQuerySchema, desktopAuthQuerySchema } from './auth.validation';

export function handleAuthRequest(context: Context<ApiEnv>) {
  return createAuthService(context.env, context.executionCtx).handler(context.req.raw);
}

export function getCurrentUser(context: Context<ApiEnv>) {
  const { id, email, name, image } = context.get('session').user;
  return context.json({ data: { id, email, name, image } });
}

export async function startDesktopAuth(context: Context<ApiEnv>) {
  const parsed = desktopAuthQuerySchema.safeParse(context.req.query());
  if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);

  return startDesktopSignIn(
    context.env,
    context.executionCtx,
    context.req.raw.headers,
    parsed.data,
  );
}

export async function finishDesktopAuth(context: Context<ApiEnv>) {
  const parsed = desktopAuthCallbackQuerySchema.safeParse(context.req.query());
  if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);

  const redirectUrl = await finishDesktopSignIn(
    context.env,
    context.executionCtx,
    context.req.raw.headers,
    {
      port: parsed.data.port,
      state: parsed.data.state,
      oauthError: parsed.data.error,
    },
  );
  return context.redirect(redirectUrl);
}
