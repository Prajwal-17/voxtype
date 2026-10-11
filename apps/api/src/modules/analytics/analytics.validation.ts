import { z } from 'zod';
import { validTimezone } from './analytics.utils';

export const analyticsQuerySchema = z.object({
  timezone: z.string().refine(validTimezone, 'Use a valid IANA timezone.').default('UTC'),
  format: z.enum(['json', 'csv']).default('json'),
  range: z.enum(['7d', '30d', 'all']).default('30d'),
});
