import { useState } from 'react';
import {
  WaveformIcon,
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
import { SettingsPage } from './pages/Settings';
const navigation = [
  { id: 'home', icon: WaveformIcon, label: 'Home' },
  { id: 'transcripts', icon: FileTextIcon, label: 'Transcripts' },
  { id: 'settings', icon: SlidersHorizontalIcon, label: 'Settings' },
] as const;
export function App() {
  const [page, setPage] = useState<'home' | 'transcripts' | 'settings' | 'profile'>('home');
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
        <SidebarHeader className="px-7 pt-9 pb-10">
          <Logo tone="ink" collapse={false} />
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="Main navigation">
            <SidebarMenu>
              {navigation.map(({ id, icon: Icon, label }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton isActive={page === id} onClick={() => setPage(id)}>
                    <Icon size={20} weight={page === id ? 'fill' : 'regular'} aria-hidden="true" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenuButton isActive={page === 'profile'} onClick={() => setPage('profile')}>
            <UserCircleIcon size={22} aria-hidden="true" />
            <span>{auth.data.name.split(' ')[0]}</span>
          </SidebarMenuButton>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="workspace-content mx-auto max-w-[1120px] px-10 py-12 max-lg:px-6">
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
                  <HomePage visible={page === 'home'} />
                </div>
                {page === 'transcripts' && <HistoryPage onRecord={() => setPage('home')} />}
                {page === 'settings' && (
                  <SettingsPage boot={boot.data} active={isActive(session.phase)} />
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
    </SidebarProvider>
  );
}
