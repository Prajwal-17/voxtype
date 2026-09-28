import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { analyticsController } from './modules/analytics/analytics.controller';
import {
  finishDesktopAuth,
  getCurrentUser,
  handleAuthRequest,
  startDesktopAuth,
} from './modules/auth/auth.controller';
import { requireAuth } from './modules/auth/auth.middleware';
import { dictationController } from './modules/dictations/dictation.controller';
import { ApiError } from './shared/errors/api-error';
import type { ApiEnv } from './shared/http/api.types';
import { apiEnvironment } from './shared/runtime/environment';

const app = new Hono<ApiEnv>();

function origins(env: Env): Set<string> {
  return new Set(
    env.CLIENT_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

app.use('*', secureHeaders());
app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id')?.slice(0, 128) || crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);
  await next();
});
app.use(
  '*',
  cors({
    origin: (origin, c) => (origins(c.env).has(origin) ? origin : null),
    credentials: true,
    allowHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
    exposeHeaders: ['Set-Auth-Token', 'X-Request-ID'],
    maxAge: 86_400,
  }),
);
app.use('/v1/*', bodyLimit({ maxSize: 256 * 1024 }));
app.use('/api/auth/*', bodyLimit({ maxSize: 64 * 1024 }));

app.get('/', (c) =>
  c.json({
    name: 'VoxType API',
    status: 'ok',
    version: 'v1',
    environment: apiEnvironment(c.env.API_URL),
  }),
);
app.get('/health', (c) => c.json({ status: 'ok', environment: apiEnvironment(c.env.API_URL) }));

app.get('/api/desktop-auth/start', startDesktopAuth);
app.get('/api/desktop-auth/callback', finishDesktopAuth);
app.all('/api/auth/*', handleAuthRequest);

app.use('/v1/*', requireAuth);
app.get('/v1/me', getCurrentUser);
app.route('/v1/dictations', dictationController);
app.route('/v1/analytics', analyticsController);

app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Route not found.' } }, 404));
app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: { code: error.code, message: error.message } }, error.status);
  }

  console.error(
    JSON.stringify({
      level: 'error',
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  return c.json(
    {
      error: {
        code: 'internal_error',
        message: 'Something went wrong.',
        requestId: c.get('requestId'),
      },
    },
    500,
  );
});

export default app;
