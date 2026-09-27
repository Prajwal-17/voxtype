import { Hono } from 'hono';
import type { ApiEnv } from '../../shared/http/api.types';
import { createAnalyticsService } from './analytics.service';
import { analyticsQuerySchema } from './analytics.validation';

export const analyticsController = new Hono<ApiEnv>();

analyticsController.get('/', async (context) => {
  const parsed = analyticsQuerySchema.safeParse(context.req.query());
  if (!parsed.success) {
    return context.json(
      {
        error: {
          code: 'validation_error',
          message: 'Use range=7d, range=30d, or range=all.',
        },
      },
      400,
    );
  }

  const data = await createAnalyticsService(context.env.DB).get(
    context.get('session').user.id,
    parsed.data.range,
  );
  return context.json({ data });
});
