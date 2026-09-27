import type { Context } from 'hono';
import type { ApiEnv } from '../../shared/http/api.types';
import { createAuthService } from './auth.service';

export function handleAuthRequest(context: Context<ApiEnv>) {
  return createAuthService(context.env, context.executionCtx).handler(context.req.raw);
}

export function getCurrentUser(context: Context<ApiEnv>) {
  const { id, email, name, image } = context.get('session').user;
  return context.json({ data: { id, email, name, image } });
}
