import type { Context } from 'hono';
import type { ApiEnv } from './api.types';

type ValidationIssue = {
  path: PropertyKey[];
  message: string;
};

export function validationError(issues: ValidationIssue[]) {
  return {
    error: {
      code: 'validation_error',
      message: 'The request data is invalid.',
      issues: issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    },
  };
}

export async function readJson(
  context: Context<ApiEnv>,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await context.req.json() };
  } catch {
    return { ok: false };
  }
}
