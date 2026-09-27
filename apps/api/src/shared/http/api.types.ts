import type { AuthSession } from '../../modules/auth/auth.types';

export type ApiEnv = {
  Bindings: Env;
  Variables: {
    requestId: string;
    session: AuthSession;
  };
};
