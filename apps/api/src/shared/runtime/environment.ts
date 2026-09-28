export type ApiEnvironment = 'development' | 'production';

export function apiEnvironment(apiUrl: string): ApiEnvironment {
  try {
    const hostname = new URL(apiUrl).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' ? 'development' : 'production';
  } catch {
    return 'production';
  }
}
