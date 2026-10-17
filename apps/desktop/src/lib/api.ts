import {
  emptyPeriod,
  clientTimezone,
  type AnalyticsRange,
  type Analytics,
} from '@voxtype/shared/analytics';
import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createDataEvents } from '@voxtype/shared/data-events';
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
  type LocalRecording,
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
// Vite supplies this compile-time flag; it is not a runtime environment binding.
const browserPreview =
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- Vite compile-time flag
  import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === '1';
const previewSignedOut = new URLSearchParams(location.search).get('auth') === 'login';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 120_000, refetchOnWindowFocus: false },
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
      : Promise.resolve(browserPreview && !previewSignedOut ? previewUser : null),
  signInWithGoogle: () => command<AuthUser>('sign_in_with_google'),
  signOut: () => (native ? command<void>('sign_out') : Promise.resolve()),
  bootstrap: () =>
    native
      ? command<Bootstrap>('bootstrap')
      : Promise.resolve<Bootstrap>({
          startupAvailable: false,
          settings: defaultSettings,
          snapshot: idleSession,
          shortcutRegistered: false,
          version: __APP_VERSION__,
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
  analytics: (
    range: AnalyticsRange = '30d',
    timezone = clientTimezone(),
    expectedUserId?: string,
  ) =>
    native
      ? command<Analytics>('get_analytics', { range, timezone, expectedUserId })
      : Promise.resolve(emptyPeriod(range, timezone)),
  exportAnalytics: (range: AnalyticsRange, timezone: string) =>
    command<boolean>('export_analytics', { range, timezone }),
  history: (cursor: string | null, query: string, expectedUserId?: string) =>
    native
      ? command<{ items: HistoryItem[]; nextCursor: string | null }>('get_history', {
          cursor,
          query,
          expectedUserId,
        })
      : Promise.resolve({ items: [] as HistoryItem[], nextCursor: null as string | null }),
  localRecordings: () =>
    native
      ? command<LocalRecording[]>('get_local_recordings')
      : Promise.resolve<LocalRecording[]>([]),
  localDiagnostics: () =>
    native
      ? command<string>('get_local_diagnostics')
      : Promise.resolve(
          JSON.stringify({ version: __APP_VERSION__, retentionDays: 14, events: [] }),
        ),
  recordingAudio: (id: string, expectedUserId: string) =>
    command<ArrayBuffer>('get_recording_audio', { id, expectedUserId }),
  regenerateTranscript: (id: string, expectedUserId: string) =>
    command<string>('regenerate_transcript', { id, expectedUserId }),
  exportRecording: (id: string) => command<void>('export_recording', { id }),
  exportDiagnostics: () => command<void>('export_local_diagnostics'),
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
export const useBootstrap = () =>
  useQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap, staleTime: Infinity });
export const useHistory = (query = '') => {
  const auth = useAuthUser();
  return useInfiniteQuery({
    queryKey: ['history', auth.data?.id, query],
    enabled: !!auth.data,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.history(pageParam, query, auth.data?.id),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
};
export const useAnalytics = (range: AnalyticsRange = '30d') => {
  const auth = useAuthUser();
  const timezone = clientTimezone();
  return useQuery({
    queryKey: [
      'analytics',
      auth.data?.id,
      range,
      timezone,
      new Date().toLocaleDateString('en-CA', { timeZone: timezone }),
    ],
    queryFn: () => api.analytics(range, timezone, auth.data?.id),
    enabled: !!auth.data,
  });
};
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
    const events = createDataEvents((key) => void client.invalidateQueries({ queryKey: [key] }));
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
        ['analytics-changed', () => events.changed('analytics')],
        [
          'history-changed',
          () => {
            events.changed('history');
          },
        ],
        ['local-recordings-changed', () => events.changed('history')],
        ['app-error', (data: unknown) => toast.error(String(data))],
      ] as const) {
        const unlisten = await listen(event, (e) => handler(e.payload));
        if (disposed) unlisten();
        else unlisteners.push(unlisten);
      }
      // Subscribe first; never overwrite a newer live event with a startup snapshot.
      const boot = await client.fetchQuery({
        queryKey: ['bootstrap'],
        queryFn: api.bootstrap,
        staleTime: Infinity,
      });
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
      events.dispose();
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
      client.removeQueries({ queryKey: ['local-recordings'] });
      client.setQueryData(['session'], idleSession);
      client.setQueryData(['app-session'], idleSession);
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
