import type { createAuthService } from './auth.service';

export type BackgroundContext = Pick<ExecutionContext, 'waitUntil'>;

export type AuthSession = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createAuthService>['api']['getSession']>>
>;
