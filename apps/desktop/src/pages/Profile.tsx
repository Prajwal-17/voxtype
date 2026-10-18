import { SignOutIcon } from '../components/icons';
import { PageHeader } from '../components/layout';
import { Button } from '../components/ui';
import type { AuthUser } from '../lib/types';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  return (parts[0]?.[0] ?? 'V') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '');
}

export function ProfilePage({
  user,
  signingOut,
  onSignOut,
}: {
  user: AuthUser;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  return (
    <>
      <PageHeader title="Account" />

      <section className="max-w-2xl">
        <div className="flex items-center gap-4 py-4 max-sm:items-start">
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-title font-semibold uppercase text-accent-ink"
            aria-hidden="true"
          >
            {initials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-title font-semibold tracking-[-.02em]">
              {user.name || 'VoxType user'}
            </h2>
            <p className="mt-0.5 truncate text-ui text-muted">{user.email}</p>
          </div>
        </div>

        <div className="border-t border-line py-4 text-ui text-muted">
          <p>Connected with Google</p>
          <p className="mt-3">
            Transcripts and your personal dictionary sync with your account. Device preferences and
            the newest 10 audio recordings stay on this device.
          </p>
        </div>
        <div className="flex items-center justify-between gap-5 border-t border-line py-4 max-sm:flex-col max-sm:items-stretch">
          <Button variant="outline" onClick={onSignOut} loading={signingOut}>
            <SignOutIcon size={16} aria-hidden="true" /> Sign out
          </Button>
        </div>
      </section>
    </>
  );
}
