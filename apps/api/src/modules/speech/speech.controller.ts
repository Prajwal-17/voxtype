import { cleanupCost } from '../analytics/analytics.costs';
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
  if (!parsed.success)
    return context.json({ error: { code: 'invalid_input', message: 'Invalid transcript.' } }, 400);
  const result = await cleanTranscript(parsed.data.text, context.env.DEEPSEEK_API_KEY);
  if (result.metered) {
    const userId = context.get('session').user.id;
    await context.env.DB.prepare(
      'INSERT INTO speech_usage (id,user_id,created_at,input_tokens,cached_tokens,output_tokens,cost_usd) VALUES (?,?,?,?,?,?,?)',
    )
      .bind(
        crypto.randomUUID(),
        userId,
        Date.now(),
        result.usage?.prompt_tokens ?? null,
        result.usage?.prompt_cache_hit_tokens ?? null,
        result.usage?.completion_tokens ?? null,
        result.usage ? cleanupCost(result.usage) : null,
      )
      .run()
      .catch(() => {
        console.error(JSON.stringify({ scope: 'speech.usage', reason: 'write_failed' }));
      });
  }
  context.header('Cache-Control', 'no-store');
  return context.json({ data: result });
});
