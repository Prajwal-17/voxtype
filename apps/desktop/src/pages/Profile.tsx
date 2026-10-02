import { SignOutIcon, ShieldCheckIcon } from '../components/icons';
import { PageHeader } from '../components/layout';
import { Button } from '../components/ui';
import { Card } from '../components/ui/card';
import type { AuthUser } from '../lib/types';
import { appName } from '../lib/environment';

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
      <PageHeader title="Profile" description={`Your ${appName} account and desktop session.`} />

      <Card className="max-w-2xl overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-5 max-sm:items-start">
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
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-caption font-medium text-success max-sm:hidden">
            <ShieldCheckIcon size={13} aria-hidden="true" /> Signed in
          </span>
        </div>

        <div className="flex items-center justify-between gap-5 border-t border-line bg-raised px-5 py-4 max-sm:flex-col max-sm:items-stretch">
          <p className="text-caption text-muted">Signed in with Google · Session stored securely</p>
          <Button variant="outline" onClick={onSignOut} loading={signingOut}>
            <SignOutIcon size={16} aria-hidden="true" /> Sign out
          </Button>
        </div>
      </Card>
    </>
  );
}
