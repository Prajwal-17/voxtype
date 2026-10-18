import { Hono } from 'hono';
import type { ApiEnv } from '../../shared/http/api.types';
import { readJson, validationError } from '../../shared/http/http.utils';
import { createDictionaryService, dictionaryPatch } from './dictionary.service';

export const dictionaryController = new Hono<ApiEnv>();
dictionaryController.get('/', async (c) =>
  c.json(await createDictionaryService(c.env.DB).get(c.get('session').user.id)),
);
dictionaryController.patch('/', async (c) => {
  const body = await readJson(c);
  if (!body.ok)
    return c.json(
      { error: { code: 'invalid_json', message: 'The request body is not JSON.' } },
      400,
    );
  const parsed = dictionaryPatch.safeParse(body.body);
  if (!parsed.success) return c.json(validationError(parsed.error.issues), 400);
  return c.json(
    await createDictionaryService(c.env.DB).update(c.get('session').user.id, parsed.data),
  );
});
