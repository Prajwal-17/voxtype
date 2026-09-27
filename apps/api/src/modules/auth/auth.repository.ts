import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { createDb } from '../../shared/database/client';
import { schema } from '../../shared/database/schema';

export function createAuthRepository(database: D1Database) {
  return drizzleAdapter(createDb(database), {
    provider: 'sqlite',
    schema,
    transaction: false,
  });
}
