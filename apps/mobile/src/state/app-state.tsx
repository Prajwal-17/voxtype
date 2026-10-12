/* eslint-disable react-refresh/only-export-components -- provider and its typed hooks form one state module */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import {
  emptyPeriod,
  clientTimezone,
  type Analytics,
  type AnalyticsRange,
} from '@voxtype/shared/analytics';
import { currentUser, getAnalytics, signIn, signOut, type User } from '../lib/mobile-api';
import Native, {
  isVoxTypeNativeAvailable,
} from '../../modules/voxtype-native/src/VoxTypeNativeModule';
import type { Snapshot, Dictation } from '../../modules/voxtype-native/src/VoxTypeNative.types';
const preview = __DEV__ && Platform.OS === 'web';
const previewSnapshot: Snapshot = {
  accessibilityEnabled: false,
  accessibilityConnected: false,
  microphoneGranted: false,
  bubbleEnabled: false,
  cleanupEnabled: false,
  syncing: false,
  syncError: '',
  audioLimit: 10,
  status: 'idle',
  inApp: { status: 'idle', text: '', error: '', durationMs: 0 },
};
function useAppStateValue() {
  const available = isVoxTypeNativeAvailable();
  const [user, setUser] = useState<User | null>(
    preview ? { id: 'preview', name: 'Preview', email: '', image: null } : null,
  );
  const [snapshot, setSnapshot] = useState<Snapshot | null>(preview ? previewSnapshot : null);
  const [loading, setLoading] = useState(available),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [message, setMessage] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const generation = useRef(0),
    account = useRef(user),
    alive = useRef(true);
  const clear = useCallback(() => {
    generation.current++;
    setSnapshot(null);
    setRevision((n) => n + 1);
  }, []);
  const applyUser = useCallback(
    (next: User | null) => {
      if (account.current?.id !== next?.id) clear();
      account.current = next;
      setUser(next);
    },
    [clear],
  );
  const notify = useCallback(
    (text: string, kind: 'success' | 'error' = 'success') => setMessage({ text, kind }),
    [],
  );
  const refresh = useCallback(async () => {
    if (!available) return;
    const gen = generation.current;
    const next = await Native.getSnapshot();
    if (alive.current && gen === generation.current) setSnapshot(next);
  }, [available]);
  const run = useCallback(
    async (task: () => Promise<void>) => {
      setBusy(true);
      setMessage(null);
      try {
        await task();
      } catch (error) {
        if (alive.current) notify(error instanceof Error ? error.message : 'Try again', 'error');
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [notify],
  );
  const microphone = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    await refresh();
    if (!permission.granted && !permission.canAskAgain) await Linking.openSettings();
    return permission.granted;
  }, [refresh]);
  useEffect(() => {
    alive.current = true;
    if (!available)
      return () => {
        alive.current = false;
      };
    let disposed = false;
    const checkAccount = async () => {
      const gen = generation.current;
      const next = await currentUser();
      if (disposed || gen !== generation.current) return;
      applyUser(next);
      if (next) {
        await refresh();
        void Native.syncTranscripts().catch(() => {
          if (!disposed) notify('Cloud sync unavailable. Try again.', 'error');
        });
      }
    };
    void checkAccount()
      .catch(() => notify('Couldn’t load account. Check your connection.', 'error'))
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = Native.addListener('onChange', () => {
      void refresh().catch(() => {});
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!disposed) setRevision((n) => n + 1);
      }, 300);
    });
    const lifecycle = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkAccount().catch(() => {});
        void refresh().catch(() => {});
        setRevision((n) => n + 1);
      }
    });
    const accountGeneration = generation;
    return () => {
      disposed = true;
      alive.current = false;
      accountGeneration.current++;
      clearTimeout(timer);
      subscription.remove();
      lifecycle.remove();
    };
  }, [available, applyUser, refresh, notify]);
  const login = () =>
    run(async () => {
      const next = await signIn();
      applyUser(next);
      await refresh();
      setRevision((n) => n + 1);
    });
  const logout = () =>
    run(async () => {
      clear();
      await signOut();
      applyUser(null);
    });
  const record = () =>
    run(async () => {
      if (await microphone()) {
        await Native.startRecording();
        await refresh();
      }
    });
  const finish = () =>
    run(async () => {
      await Native.stopRecording();
      await refresh();
    });
  const cancel = () =>
    run(async () => {
      await Native.cancelRecording();
      await refresh();
    });
  return {
    user,
    snapshot,
    loading,
    busy,
    available,
    preview,
    revision,
    message,
    setMessage,
    notify,
    run,
    refresh,
    acceptUser: applyUser,
    microphone,
    login,
    logout,
    record,
    finish,
    cancel,
    generation,
  };
}
const AppContext = createContext<ReturnType<typeof useAppStateValue> | null>(null);
export function AppStateProvider({ children }: { children: ReactNode }) {
  const value = useAppStateValue();
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useAppState() {
  const state = useContext(AppContext);
  if (!state) throw new Error('Missing app state');
  return state;
}
export function useAnalyticsData(range: AnalyticsRange) {
  const { user, available, preview, revision } = useAppState(),
    timezone = clientTimezone();
  const userId = user?.id;
  const [data, setData] = useState<Analytics | null>(preview ? emptyPeriod('30d', timezone) : null),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset data on account/range changes before subscribing to the request
    setData(preview ? emptyPeriod(range, timezone) : null);
    setError(false);
    if (!userId || !available) return;
    setLoading(true);
    void getAnalytics(range, timezone, controller.signal)
      .then((next) => {
        if (!disposed) setData(next);
      })
      .catch(() => {
        if (!disposed) setError(true);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [userId, available, preview, revision, range, timezone, retry]);
  return { data, error, loading, retry: () => setRetry((n) => n + 1) };
}
/** Query runs over the entire native account cache before the 12-row cursor limit. */
export function useTranscripts(query = '') {
  const { user, available, revision, generation } = useAppState();
  const userId = user?.id;
  const [items, setItems] = useState<Dictation[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(false);
  const request = useRef(0),
    busy = useRef(false),
    failedCursor = useRef<string | null>(null);
  const load = useCallback(
    async (next: string | null = null) => {
      if (!available || !userId || busy.current) return;
      const id = ++request.current,
        gen = generation.current;
      busy.current = true;
      setLoading(true);
      setError(false);
      try {
        const page = await Native.getTranscripts(next, query.trim());
        if (id !== request.current || gen !== generation.current) return;
        setItems((old) =>
          next
            ? [
                ...old,
                ...page.items.filter((item) => !old.some((previous) => previous.id === item.id)),
              ]
            : page.items,
        );
        setCursor(page.nextCursor);
      } catch {
        if (id === request.current && gen === generation.current) {
          failedCursor.current = next;
          setError(true);
        }
      } finally {
        if (id === request.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [available, userId, query, generation],
  );
  useEffect(() => {
    const sequence = request;
    sequence.current++;
    busy.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- changing the native query invalidates its cursor and account-scoped rows
    setItems([]);
    setCursor(null);
    setError(false);
    setLoading(false);
    const timer = setTimeout(() => void load(), 180);
    return () => {
      clearTimeout(timer);
      sequence.current++;
      busy.current = false;
    };
  }, [load, revision]);
  return {
    items,
    cursor,
    loading,
    error,
    more: () => load(error ? failedCursor.current : cursor),
    refresh: () => load(),
  };
}
