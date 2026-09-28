import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiEnv } from '../../shared/http/api.types';
import { grantDeepgramToken, cleanTranscript } from './speech.service';

export const speechController = new Hono<ApiEnv>();
const cleanupBody = z.object({ text: z.string().min(1).max(12_000) });

speechController.post('/token', async (context) => {
  const result = await grantDeepgramToken(context.env.DEEPGRAM_API_KEY);
  context.header('Cache-Control', 'no-store');
  return context.json({ data: result });
});

speechController.post('/cleanup', async (context) => {
  const parsed = cleanupBody.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: { code: 'invalid_input', message: 'Invalid transcript.' } }, 400);
  const result = await cleanTranscript(parsed.data.text, context.env.DEEPSEEK_API_KEY);
  context.header('Cache-Control', 'no-store');
  return context.json({ data: result });
});
