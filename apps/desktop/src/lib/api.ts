import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import {
  defaultSettings,
  errorMessage,
  idleSession,
  settingsSchema,
  type Bootstrap,
  type Diagnostic,
  type HistoryItem,
  type Microphone,
  type Session,
  type Settings,
} from './types';

export const native = isTauri();
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
    mutations: { retry: false, onError: (error) => toast.error(errorMessage(error)) },
  },
});
async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!native) throw new Error('Open the installed Flow desktop app to use this feature.');
  return invoke<T>(name, args);
}
export const api = {
  bootstrap: () =>
    native
      ? command<Bootstrap>('bootstrap')
      : Promise.resolve({
          settings: defaultSettings,
          hasKey: false,
          keyError: null,
          hasCleanupKey: false,
          cleanupKeyError: null,
          snapshot: idleSession,
          shortcutRegistered: false,
          version: '0.1.0',
        }),
  history: () => (native ? command<HistoryItem[]>('get_history') : Promise.resolve([])),
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
  enableShortcut: () => command<void>('enable_shortcut'),
  settings: (settings: Settings) =>
    command<void>('update_settings', { settings: settingsSchema.parse(settings) }),
  saveKey: (key: string) => command<void>('save_api_key', { key }),
  removeKey: () => command<void>('remove_api_key'),
  saveCleanupKey: (key: string) => command<void>('save_cleanup_key', { key }),
  removeCleanupKey: () => command<void>('remove_cleanup_key'),
  deleteHistory: (id: string | null) => command<void>('delete_history', { id }),
  start: (test = false) => command<void>('start_dictation', { test }),
  stop: () => command<void>('stop_dictation'),
  cancel: () => command<void>('cancel_dictation'),
  copy: (text: string) =>
    native ? command<void>('copy_text', { text }) : navigator.clipboard.writeText(text),
  openMain: () => command<void>('open_main'),
  dismiss: () => command<void>('dismiss_overlay'),
  openDeepgram: () =>
    native
      ? openUrl('https://console.deepgram.com/')
      : Promise.resolve(
          window.open('https://console.deepgram.com/', '_blank', 'noopener,noreferrer'),
        ),
};
export const useBootstrap = () => useQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap });
export const useHistory = () => useQuery({ queryKey: ['history'], queryFn: api.history });
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
        ['session', (data: unknown) => client.setQueryData<Session>(['session'], data as Session)],
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
