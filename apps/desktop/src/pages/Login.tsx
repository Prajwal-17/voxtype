import { WarningCircleIcon } from '../components/icons';
import { useEffect, useRef } from 'react';
import { Button, Logo } from '../components/ui';
import { Card } from '../components/ui/card';
import { appName } from '../lib/environment';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.42l-3.24-2.51c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.9A6 6 0 0 1 6.07 12c0-.66.11-1.3.32-1.9V7.51H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.49l3.35-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.97c1.47 0 2.79.5 3.83 1.5L18.7 4.6A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.59C7.18 7.73 9.39 5.97 12 5.97Z"
      />
    </svg>
  );
}

export function LoginPage({
  checking,
  pending,
  error,
  onSignIn,
}: {
  checking: boolean;
  pending: boolean;
  error?: string;
  onSignIn: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const status = checking ? 'Loading' : pending ? 'Signing in' : '';

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10 text-ink selection:bg-accent-soft selection:text-accent-ink">
      <div className="w-full max-w-[420px]">
        <Logo tone="ink" collapse={false} className="justify-center" />

        <Card className="mt-7 overflow-hidden">
          <div className="px-7 pt-7 pb-6 text-center max-sm:px-5">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-heading font-semibold tracking-[-.02em] text-balance outline-none"
            >
              Sign in to {appName}
            </h1>

            {error && (
              <div
                className="mt-5 flex items-start gap-2.5 rounded-control bg-danger-soft px-3.5 py-3 text-left text-ui text-danger"
                role="alert"
              >
                <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <Button
              variant="outline"
              size="lg"
              className="mt-6 w-full bg-surface"
              onClick={onSignIn}
              loading={checking || pending}
              disabled={checking}
            >
              {!checking && !pending && <GoogleMark />}
              {checking ? 'Loading' : pending ? 'Waiting for Google' : 'Sign in with Google'}
            </Button>
            <span className="sr-only" role="status" aria-live="polite">
              {status}
            </span>
          </div>
        </Card>
      </div>
    </main>
  );
}
