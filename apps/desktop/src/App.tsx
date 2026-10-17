import { useState } from 'react';
import {
  HouseIcon,
  ChartBarIcon,
  FileTextIcon,
  SlidersHorizontalIcon,
  UserCircleIcon,
} from './components/icons';
import { Logo, Button } from './components/ui';
import { Loader } from './components/loader';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
} from './components/ui/sidebar';
import { useAuthActions, useAuthUser, useBootstrap, useSession } from './lib/api';
import { errorMessage, isActive } from './lib/types';
import { HomePage } from './pages/Home';
import { HistoryPage } from './pages/History';
import { LoginPage } from './pages/Login';
import { ProfilePage } from './pages/Profile';
import { InsightsPage } from './pages/Insights';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from './components/ui/alert-dialog';
import { useRecording } from './lib/api';
import { SettingsPage } from './pages/Settings';
const navigation = [
  { id: 'home', icon: HouseIcon, label: 'Home' },
  { id: 'transcripts', icon: FileTextIcon, label: 'Transcripts' },
  { id: 'insights', icon: ChartBarIcon, label: 'Insights' },
  { id: 'settings', icon: SlidersHorizontalIcon, label: 'Settings' },
] as const;
export function App() {
  type Page = 'home' | 'transcripts' | 'insights' | 'settings' | 'profile';
  const [page, setPage] = useState<Page>('home');
  const [dirty, setDirty] = useState(false);
  const [destination, setDestination] = useState<Page | null>(null);
  const [settingsEpoch, setSettingsEpoch] = useState(0);
  const [settingsVisited, setSettingsVisited] = useState(false);
  const navigate = (next: Page) => {
    if (next === page) return;
    if (page === 'settings' && dirty) {
      setDestination(next);
      return;
    }
    if (next === 'settings') setSettingsVisited(true);
    setPage(next);
  };
  const recording = useRecording();
  const auth = useAuthUser();
  const { signIn, signOut } = useAuthActions();
  const boot = useBootstrap();
  const { data: session } = useSession();
  if (auth.isPending) return <Loader />;
  if (!auth.data)
    return (
      <LoginPage
        checking={false}
        pending={signIn.isPending}
        error={signIn.error || auth.error ? errorMessage(signIn.error ?? auth.error) : undefined}
        onSignIn={() => signIn.mutate()}
      />
    );
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-5 py-7">
          <Logo tone="ink" collapse={false} />
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="Main navigation">
            <SidebarMenu>
              {navigation.map(({ id, icon: Icon, label }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={page === id}
                    onClick={() => navigate(id)}
                    aria-label={label}
                  >
                    <Icon size={22} weight="bold" aria-hidden="true" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarContent>
        <SidebarFooter>
          {boot.data && (
            <div className="shortcut-footer mx-2 border-t border-line pt-4 text-caption text-muted">
              <kbd className="inline-block rounded-[4px] border border-line bg-surface px-2 py-1 text-ink">
                {boot.data.shortcutLabel}
              </kbd>
              <p className="mt-2">Recording shortcut</p>
            </div>
          )}
          <SidebarMenuButton
            isActive={page === 'profile'}
            onClick={() => navigate('profile')}
            aria-label="Account"
          >
            <UserCircleIcon size={22} aria-hidden="true" />
            <span>{auth.data.name.split(' ')[0]}</span>
          </SidebarMenuButton>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        {page !== 'home' && !session.external && !session.isTest && isActive(session.phase) && (
          <div
            className="mx-5 mt-4 flex flex-wrap items-center gap-3 rounded-control border border-line bg-accent-soft px-4 py-2 text-ui"
            role="status"
          >
            <span className="mr-auto">
              {session.phase === 'listening' ? 'Recording' : 'Transcribing'}
            </span>
            <Button
              disabled={session.phase !== 'listening'}
              onClick={() => recording.stop.mutate()}
            >
              Finish
            </Button>
            <Button variant="ghost" onClick={() => recording.cancel.mutate()}>
              Cancel
            </Button>
          </div>
        )}
        <div className="workspace-content mx-auto max-w-[1200px]">
          {boot.isPending ? (
            <Loader />
          ) : boot.isError ? (
            <div role="alert">
              Couldn’t load settings. <Button onClick={() => void boot.refetch()}>Retry</Button>
            </div>
          ) : (
            boot.data && (
              <>
                <div hidden={page !== 'home'}>
                  <HomePage key={auth.data.id} visible={page === 'home'} onNavigate={navigate} />
                </div>
                {page === 'transcripts' && <HistoryPage onRecord={() => navigate('home')} />}
                {page === 'insights' && <InsightsPage />}
                {settingsVisited && (
                  <div hidden={page !== 'settings'}>
                    <SettingsPage
                      key={settingsEpoch}
                      boot={boot.data}
                      active={isActive(session.phase)}
                      onDirtyChange={setDirty}
                    />
                  </div>
                )}
                {page === 'profile' && (
                  <ProfilePage
                    user={auth.data}
                    signingOut={signOut.isPending}
                    onSignOut={() => signOut.mutate()}
                  />
                )}
              </>
            )
          )}
        </div>
      </SidebarInset>
      <AlertDialog
        open={destination !== null}
        onOpenChange={(open) => {
          if (!open) setDestination(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Your preference and shortcut drafts will be discarded.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSettingsEpoch((n) => n + 1);
                setDirty(false);
                if (destination) setPage(destination);
                setDestination(null);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
