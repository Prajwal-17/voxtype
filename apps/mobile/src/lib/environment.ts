export const LOCAL_API_URL = 'http://localhost:8788';
export const PRODUCTION_API_URL = 'https://voxtype-api-production.prajwalreddy-dev.workers.dev';

export function resolveApiUrl(configured: unknown, development: boolean): string {
  const override = typeof configured === 'string' ? configured.trim() : '';
  return (override || (development ? LOCAL_API_URL : PRODUCTION_API_URL)).replace(/\/+$/, '');
}
