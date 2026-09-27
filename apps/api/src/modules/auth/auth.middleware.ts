import type { MiddlewareHandler } from 'hono';
import type { ApiEnv } from '../../shared/http/api.types';
import { createAuthService } from './auth.service';
import { normalizeEmail } from './auth.utils';

export const requireAuth: MiddlewareHandler<ApiEnv> = async (context, next) => {
  const session = await createAuthService(context.env, context.executionCtx).api.getSession({
    headers: context.req.raw.headers,
  });

  if (!session) {
    return context.json({ error: { code: 'unauthorized', message: 'Sign in to continue.' } }, 401);
  }

  if (normalizeEmail(session.user.email) !== normalizeEmail(context.env.ALLOWED_EMAIL)) {
    return context.json(
      { error: { code: 'forbidden', message: 'This account is not allowed.' } },
      403,
    );
  }

  context.set('session', session);
  await next();
};
