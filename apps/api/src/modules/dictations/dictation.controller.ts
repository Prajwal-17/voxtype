import { Hono } from 'hono';
import type { ApiEnv } from '../../shared/http/api.types';
import { readJson, validationError } from '../../shared/http/http.utils';
import { createDictationService } from './dictation.service';
import {
  createDictationSchema,
  dictationIdSchema,
  dictationInputSchema,
  listDictationsSchema,
} from './dictation.validation';

export const dictationController = new Hono<ApiEnv>();

dictationController.get('/', async (context) => {
  const parsed = listDictationsSchema.safeParse(context.req.query());
  if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);

  const data = await createDictationService(context.env.DB).list(
    context.get('session').user.id,
    parsed.data,
  );
  return context.json(data);
});

dictationController.get('/:id', async (context) => {
  const id = dictationIdSchema.safeParse(context.req.param('id'));
  if (!id.success) return context.json(validationError(id.error.issues), 400);

  const data = await createDictationService(context.env.DB).get(
    context.get('session').user.id,
    id.data,
  );
  return context.json({ data });
});

dictationController.post('/', async (context) => {
  const body = await readJson(context);
  if (!body.ok) {
    return context.json(
      { error: { code: 'invalid_json', message: 'The request body is not JSON.' } },
      400,
    );
  }

  const parsed = createDictationSchema.safeParse(body.body);
  if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);

  const data = await createDictationService(context.env.DB).create(
    context.get('session').user.id,
    parsed.data,
  );
  return context.json({ data }, 201);
});

dictationController.put('/:id', async (context) => {
  const id = dictationIdSchema.safeParse(context.req.param('id'));
  if (!id.success) return context.json(validationError(id.error.issues), 400);

  const body = await readJson(context);
  if (!body.ok) {
    return context.json(
      { error: { code: 'invalid_json', message: 'The request body is not JSON.' } },
      400,
    );
  }

  const parsed = dictationInputSchema.safeParse(body.body);
  if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);

  const result = await createDictationService(context.env.DB).upsert(
    context.get('session').user.id,
    id.data,
    parsed.data,
  );
  return context.json({ data: result.data }, result.created ? 201 : 200);
});

dictationController.delete('/:id', async (context) => {
  const id = dictationIdSchema.safeParse(context.req.param('id'));
  if (!id.success) return context.json(validationError(id.error.issues), 400);

  await createDictationService(context.env.DB).remove(context.get('session').user.id, id.data);
  return context.body(null, 204);
});

dictationController.delete('/', async (context) => {
  const deleted = await createDictationService(context.env.DB).removeAll(
    context.get('session').user.id,
  );
  return context.json({ deleted });
});
