/* eslint-disable react-refresh/only-export-components -- provider and its typed hooks form one state module */
import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useSyncExternalStore,
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
import { createTranscriptQuery } from '../lib/transcript-query';
import { RequestCache } from '@voxtype/shared/request-cache';
import { API_URL, currentUser, getAnalytics, signIn, signOut, type User } from '../lib/mobile-api';
import Native, {
  isVoxTypeNativeAvailable,
} from '../../modules/voxtype-native/src/VoxTypeNativeModule';
import type { Snapshot } from '../../modules/voxtype-native/src/VoxTypeNative.types';
const analyticsCache = new RequestCache<Analytics>();
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
    [revision, setRevision] = useState(0),
    [analyticsRevision, setAnalyticsRevision] = useState(0),
    [foregroundRevision, setForegroundRevision] = useState(0);
  const [message, setMessage] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const generation = useRef(0),
    account = useRef(user),
    alive = useRef(true);
  const clear = useCallback(() => {
    generation.current++;
    analyticsCache.clear();
    setAnalyticsRevision((n) => n + 1);
    setSnapshot(null);
    setRevision((n) => n + 1);
  }, []);
  const applyUser = useCallback(
    (next: User | null) => {
      if (account.current?.id !== next?.id) clear();
      account.current = next;
      setUser(next);
      if (next) setMessage(null);
    },
    [clear],
  );
  const notify = useCallback(
    (text: string, kind: 'success' | 'error' = 'success') => setMessage({ text, kind }),
    [],
  );
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), message.kind === 'error' ? 8000 : 3000);
    return () => clearTimeout(timer);
  }, [message]);
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
    let checking: Promise<void> | null = null;
    let checkedAt = 0;
    const loadAccount = async () => {
      const gen = generation.current;
      const next = await currentUser();
      if (disposed || gen !== generation.current) return;
      applyUser(next);
      if (next) {
        await refresh();
        void Native.syncVocabulary().catch(() => {});
        void Native.syncTranscripts().catch(() => {
          if (!disposed) notify('Cloud sync unavailable. Try again.', 'error');
        });
      }
    };
    const checkAccount = () => {
      if (checking) return checking;
      if (Date.now() - checkedAt < 60_000) return Promise.resolve();
      checking = loadAccount()
        .then(() => {
          checkedAt = Date.now();
        })
        .finally(() => {
          checking = null;
        });
      return checking;
    };
    void checkAccount()
      .catch(() => notify('Couldn’t load account. Check your connection.', 'error'))
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let historyChanged = false,
      analyticsChanged = false;
    const subscription = Native.addListener('onChange', ({ kind }) => {
      historyChanged ||= kind === 'history';
      analyticsChanged ||= kind === 'analytics';
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (disposed) return;
        void refresh().catch(() => {});
        if (historyChanged) setRevision((n) => n + 1);
        if (analyticsChanged) {
          analyticsCache.clear();
          setAnalyticsRevision((n) => n + 1);
        }
        historyChanged = false;
        analyticsChanged = false;
      }, 180);
    });
    const dictionaryTimer = setInterval(() => {
      if (AppState.currentState === 'active') void Native.syncVocabulary().catch(() => {});
    }, 30_000);
    const lifecycle = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void Native.syncVocabulary().catch(() => {});
        void checkAccount().catch(() => {});
        void refresh().catch(() => {});
        setForegroundRevision((n) => n + 1);
        setRevision((n) => n + 1);
      }
    });
    const accountGeneration = generation;
    return () => {
      disposed = true;
      alive.current = false;
      accountGeneration.current++;
      clearTimeout(timer);
      clearInterval(dictionaryTimer);
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
    analyticsRevision,
    foregroundRevision,
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
  return (
    <AppContext.Provider value={value}>
      <Fragment key={value.user?.id ?? 'signed-out'}>{children}</Fragment>
    </AppContext.Provider>
  );
}
export function useAppState() {
  const state = useContext(AppContext);
  if (!state) throw new Error('Missing app state');
  return state;
}
export function useAnalyticsData(range: AnalyticsRange) {
  const { user, available, preview, analyticsRevision, foregroundRevision } = useAppState(),
    timezone = clientTimezone();
  const userId = user?.id;
  const dataKey = JSON.stringify([userId, range, timezone]);
  const [result, setResult] = useState<{ key: string; data: Analytics } | null>(null),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset data on account/range changes before subscribing to the request
    if (preview) setResult({ key: dataKey, data: emptyPeriod(range, timezone) });
    setError(false);
    if (!userId || !available) return;
    setLoading(true);
    void analyticsCache
      .get(
        JSON.stringify([
          API_URL,
          userId,
          range,
          timezone,
          new Date().toLocaleDateString('en-CA', { timeZone: timezone }),
        ]),
        () => getAnalytics(range, timezone, undefined, userId),
      )
      .then((next) => {
        if (!disposed) setResult({ key: dataKey, data: next });
      })
      .catch(() => {
        if (!disposed) setError(true);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [
    userId,
    available,
    preview,
    analyticsRevision,
    foregroundRevision,
    range,
    timezone,
    retry,
    dataKey,
  ]);
  return {
    data: result?.key === dataKey ? result.data : preview ? emptyPeriod(range, timezone) : null,
    error,
    loading,
    retry: () => {
      analyticsCache.clear();
      setRetry((n) => n + 1);
    },
  };
}
/** Query runs over the entire native account cache before the 12-row cursor limit. */
export function useTranscripts(query = '') {
  const { user, available, revision } = useAppState();
  const userId = user?.id;
  const search = query.trim();
  const controller = useMemo(
    () =>
      createTranscriptQuery((cursor) =>
        available && userId
          ? Native.getTranscripts(cursor, search, userId)
          : Promise.resolve({ items: [], nextCursor: null }),
      ),
    [available, userId, search],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    const timer = setTimeout(() => void controller.refresh(), search ? 180 : 0);
    return () => {
      clearTimeout(timer);
      controller.cancel();
    };
  }, [controller, revision, search]);
  return { ...state, refresh: controller.refresh, more: controller.more };
}
