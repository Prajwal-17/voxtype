import { z } from 'zod';

export const dictationIdSchema = z.uuid();

export const dictationInputSchema = z.object({
  text: z.string().trim().min(1).max(100_000),
  originalText: z.string().trim().min(1).max(100_000).nullish(),
  createdAt: z.number().int().nonnegative(),
  durationMs: z.number().int().min(0).max(86_400_000),
  delivery: z.enum(['saved', 'copied', 'pasted']),
});

export const createDictationSchema = dictationInputSchema.extend({
  id: dictationIdSchema.optional(),
});

export const listDictationsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(512).optional(),
  q: z.string().trim().max(100).optional(),
});
