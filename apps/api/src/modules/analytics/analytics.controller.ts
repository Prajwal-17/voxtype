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
          message: 'Use a supported range and IANA timezone.',
        },
      },
      400,
    );
  }

  if (parsed.data.format === 'csv') {
    const csv = await createAnalyticsService(context.env.DB).csv(
      context.get('session').user.id,
      parsed.data.range,
      parsed.data.timezone,
    );
    return context.body(csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=voxtype-insights.csv',
    });
  }
  const data = await createAnalyticsService(context.env.DB).get(
    context.get('session').user.id,
    parsed.data.range,
    parsed.data.timezone,
  );
  return context.json({ data });
});
