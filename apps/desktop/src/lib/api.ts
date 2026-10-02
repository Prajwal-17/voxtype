import { emptyAnalytics, type Analytics } from '@voxtype/shared/analytics';
import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { appEnvironment, isDevelopment, shortcutId, shortcutLabel } from './environment';
import {
  defaultSettings,
  errorMessage,
  idleSession,
  settingsSchema,
  type AuthUser,
  type Bootstrap,
  type Diagnostic,
  type HistoryItem,
  type Microphone,
  type Session,
  type Settings,
} from './types';

export const native = isTauri();
const previewUser: AuthUser = {
  id: 'browser-preview',
  name: 'Prajwal Reddy',
  email: 'prajwalreddy.dev@gmail.com',
};
const previewSignedOut = new URLSearchParams(location.search).get('auth') === 'login';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
    mutations: {
      retry: false,
      onError: (error, _variables, _result, context) => {
        if (context.meta?.suppressErrorToast !== true) toast.error(errorMessage(error));
      },
    },
  },
});
if (isDevelopment) window.__VOXTYPE_QUERY_CLIENT__ = queryClient;

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!native) throw new Error('Open the installed VoxType desktop app to use this feature.');
  return invoke<T>(name, args);
}

export const api = {
  authUser: () =>
    native
      ? command<AuthUser | null>('get_auth_user')
      : Promise.resolve(previewSignedOut ? null : previewUser),
  signInWithGoogle: () =>
    native ? command<AuthUser>('sign_in_with_google') : Promise.resolve(previewUser),
  signOut: () => (native ? command<void>('sign_out') : Promise.resolve()),
  bootstrap: () =>
    native
      ? command<Bootstrap>('bootstrap')
      : Promise.resolve<Bootstrap>({
          settings: defaultSettings,
          snapshot: idleSession,
          shortcutRegistered: false,
          version: '0.1.2',
          environment: appEnvironment,
          shortcutId,
          shortcutLabel,
          shortcutOptions: [
            { id: 'right-alt', label: 'Right Alt' },
            { id: 'ctrl-alt-space', label: 'Ctrl Alt Space' },
            { id: 'ctrl-shift-space', label: 'Ctrl Shift Space' },
            { id: 'super-shift-space', label: 'Super Shift Space' },
            { id: 'ctrl-alt-d', label: 'Ctrl Alt D' },
            { id: 'f8', label: 'F8' },
          ],
        }),
  analytics: () => (native ? command<Analytics>('get_analytics') : Promise.resolve(emptyAnalytics)),
  history: (cursor: string | null, query: string) =>
    native
      ? command<{ items: HistoryItem[]; nextCursor: string | null }>('get_history', {
          cursor,
          query,
        })
      : Promise.resolve({ items: [] as HistoryItem[], nextCursor: null as string | null }),
  microphones: () => (native ? command<Microphone[]>('get_microphones') : Promise.resolve([])),
  diagnostics: () =>
    native
      ? command<Diagnostic[]>('get_diagnostics')
      : Promise.resolve<Diagnostic[]>([
          {
            name: 'Browser preview',
            status: 'warning',
            detail: 'Desktop checks run in the installed Tauri app.',
          },
        ]),
  configureShortcut: (shortcutId: string) => command<void>('configure_shortcut', { shortcutId }),
  settings: (settings: Settings) =>
    command<void>('update_settings', { settings: settingsSchema.parse(settings) }),
  deleteHistory: (id: string | null) => command<void>('delete_history', { id }),
  start: (test = false) => command<string>('start_dictation', { test }),
  stop: () => command<void>('stop_dictation'),
  cancel: () => command<void>('cancel_dictation'),
  copy: (text: string) =>
    native ? command<void>('copy_text', { text }) : navigator.clipboard.writeText(text),
  openMain: () => command<void>('open_main'),
  dismiss: () => command<void>('dismiss_overlay'),
};
export const useAuthUser = () =>
  useQuery({
    queryKey: ['auth-user'],
    queryFn: api.authUser,
    retry: false,
    staleTime: Infinity,
  });
export const useBootstrap = () => useQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap });
export const useHistory = (query = '') =>
  useInfiniteQuery({
    queryKey: ['history', query],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.history(pageParam, query),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
export const useAnalytics = () => useQuery({ queryKey: ['analytics'], queryFn: api.analytics });
export const useAppSession = () =>
  useQuery({
    queryKey: ['app-session'],
    queryFn: () => Promise.resolve(idleSession),
    initialData: idleSession,
    staleTime: Infinity,
  });
export const useSession = () =>
  useQuery({
    queryKey: ['session'],
    queryFn: () => Promise.resolve(idleSession),
    initialData: idleSession,
    staleTime: Infinity,
  });

export function useNativeEvents() {
  const client = useQueryClient();
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const subscribe = async () => {
      for (const [event, handler] of [
        [
          'session',
          (data: unknown) => {
            const session = data as Session;
            client.setQueryData<Session>(['session'], session);
            if (!session.external && !session.isTest)
              client.setQueryData<Session>(['app-session'], session);
          },
        ],
        ['analytics-changed', () => void client.invalidateQueries({ queryKey: ['analytics'] })],
        ['history-changed', () => void client.invalidateQueries({ queryKey: ['history'] })],
        ['app-error', (data: unknown) => toast.error(String(data))],
      ] as const) {
        const unlisten = await listen(event, (e) => handler(e.payload));
        if (disposed) unlisten();
        else unlisteners.push(unlisten);
      }
      // Subscribe first; never overwrite a newer live event with a startup snapshot.
      const boot = await client.fetchQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap });
      if (!disposed) {
        client.setQueryData(['bootstrap'], boot);
        client.setQueryData<Session>(['session'], (previous) =>
          previous?.sessionId ? previous : boot.snapshot,
        );
      }
    };
    void subscribe().catch((error) => {
      if (!disposed) toast.error(errorMessage(error));
    });
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [client]);
}
export function useRecording() {
  const start = useMutation({ mutationFn: api.start });
  const stop = useMutation({ mutationFn: api.stop });
  const cancel = useMutation({ mutationFn: api.cancel });
  return { start, stop, cancel, pending: start.isPending || stop.isPending || cancel.isPending };
}
export function useCopy() {
  return useMutation({
    mutationFn: api.copy,
    onSuccess: () => toast.success('Copied to clipboard'),
  });
}

export function useAuthActions() {
  const client = useQueryClient();
  const signIn = useMutation({
    meta: { suppressErrorToast: true },
    mutationFn: api.signInWithGoogle,
    onSuccess: (user) => {
      client.removeQueries({ queryKey: ['history'] });
      client.removeQueries({ queryKey: ['analytics'] });
      client.setQueryData<AuthUser>(['auth-user'], user);
    },
  });
  const signOut = useMutation({
    mutationFn: api.signOut,
    onSuccess: () => {
      client.clear();
      client.setQueryData<AuthUser | null>(['auth-user'], null);
    },
  });
  return { signIn, signOut };
}
