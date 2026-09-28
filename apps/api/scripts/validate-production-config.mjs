import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const production = config.slice(config.indexOf('"production"'));

if (
  !production ||
  production.includes('configure-before-deploy.invalid') ||
  production.includes('00000000-0000-0000-0000-000000000000')
) {
  throw new Error(
    'Configure env.production API_URL, CLIENT_ORIGINS, and D1 database_id in wrangler.jsonc before deploying VoxType.',
  );
}
