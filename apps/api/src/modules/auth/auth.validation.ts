import { z } from 'zod';

export const desktopAuthQuerySchema = z.object({
  port: z.coerce.number().int().min(1024).max(65_535),
  state: z.uuid(),
});

export const desktopAuthCallbackQuerySchema = desktopAuthQuerySchema.extend({
  error: z.string().max(128).optional(),
});
