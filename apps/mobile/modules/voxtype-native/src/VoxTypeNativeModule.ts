import { NativeModule, requireNativeModule } from 'expo';

import type {
  LocalRecording,
  Snapshot,
  TranscriptPage,
  VoxTypeNativeModuleEvents,
} from './VoxTypeNative.types';

declare class VoxTypeNativeModule extends NativeModule<VoxTypeNativeModuleEvents> {
  setVocabulary(terms: string[]): Promise<void>;
  setAuthState(state: string): Promise<void>;
  getAuthState(): Promise<string | null>;
  getSnapshot(): Promise<Snapshot>;
  getSession(): Promise<{ token: string | null; userId: string | null }>;
  setSession(token: string, userId: string, apiUrl: string): Promise<void>;
  signOut(): Promise<void>;
  openAccessibilitySettings(): Promise<void>;
  pauseForPayments?: () => Promise<void>;
  setPreference(key: 'bubbleEnabled' | 'cleanupEnabled', value: string): Promise<void>;
  // Typed alternatives (added natively, optional on older builds).
  setBubbleEnabled?: (enabled: boolean) => Promise<void>;
  setCleanupEnabled?: (enabled: boolean) => Promise<void>;
  copyTranscript(id: string): Promise<boolean>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<void>;
  cancelRecording(): Promise<void>;
  getTranscripts(
    cursor: string | null,
    query: string,
    expectedUserId?: string,
  ): Promise<TranscriptPage>;
  syncTranscripts(): Promise<void>;
  deleteTranscript(id: string): Promise<void>;
  getLocalRecordings(): Promise<LocalRecording[]>;
  shareRecording(id: string): Promise<void>;
  getLocalDiagnostics(): Promise<string>;
  shareLocalDiagnostics(): Promise<void>;
  shareInsights(csv: string): Promise<void>;
}

let cached: VoxTypeNativeModule | null | undefined;

export function getVoxTypeNative(): VoxTypeNativeModule | null {
  if (cached === undefined) {
    try {
      cached = requireNativeModule<VoxTypeNativeModule>('VoxTypeNative');
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function isVoxTypeNativeAvailable(): boolean {
  return getVoxTypeNative() !== null;
}

function missingModuleError(): Error {
  return new Error(
    'VoxType native code is missing from this build. Run a VoxType dev client instead of Expo Go.',
  );
}

function requireVoxTypeModule(): VoxTypeNativeModule {
  const module = getVoxTypeNative();
  if (!module) {
    throw missingModuleError();
  }
  return module;
}

/**
 * Lazily resolved native module. Importing this file never throws, even in
 * Expo Go where the native side cannot exist; calls throw a dev-build hint
 * when the native side is absent.
 */
const VoxTypeNative = {
  setVocabulary: (terms: string[]) => requireVoxTypeModule().setVocabulary(terms),
  setAuthState: (state: string) => requireVoxTypeModule().setAuthState(state),
  getAuthState: () => requireVoxTypeModule().getAuthState(),
  getSnapshot: (): Promise<Snapshot> => requireVoxTypeModule().getSnapshot(),
  getSession: () => requireVoxTypeModule().getSession(),
  setSession: (token: string, userId: string, apiUrl: string) =>
    requireVoxTypeModule().setSession(token, userId, apiUrl),
  signOut: () => requireVoxTypeModule().signOut(),
  openAccessibilitySettings: () => requireVoxTypeModule().openAccessibilitySettings(),
  pauseForPayments: () =>
    requireVoxTypeModule().pauseForPayments?.() ??
    requireVoxTypeModule().openAccessibilitySettings(),
  setPreference: (key: 'bubbleEnabled' | 'cleanupEnabled', value: string) =>
    requireVoxTypeModule().setPreference(key, value),
  setBubbleEnabled: (enabled: boolean) =>
    requireVoxTypeModule().setBubbleEnabled?.(enabled) ??
    requireVoxTypeModule().setPreference('bubbleEnabled', String(enabled)),
  setCleanupEnabled: (enabled: boolean) =>
    requireVoxTypeModule().setCleanupEnabled?.(enabled) ??
    requireVoxTypeModule().setPreference('cleanupEnabled', String(enabled)),
  copyTranscript: (id: string) => requireVoxTypeModule().copyTranscript(id),
  getTranscripts: (cursor: string | null, query = '', expectedUserId?: string) =>
    requireVoxTypeModule().getTranscripts(cursor, query, expectedUserId),
  deleteTranscript: (id: string) => requireVoxTypeModule().deleteTranscript(id),
  shareInsights: (csv: string) => requireVoxTypeModule().shareInsights(csv),
  syncTranscripts: () => requireVoxTypeModule().syncTranscripts(),
  startRecording: () => requireVoxTypeModule().startRecording(),
  cancelRecording: () => requireVoxTypeModule().cancelRecording(),
  stopRecording: () => requireVoxTypeModule().stopRecording(),
  getLocalRecordings: () => requireVoxTypeModule().getLocalRecordings(),
  shareRecording: (id: string) => requireVoxTypeModule().shareRecording(id),
  getLocalDiagnostics: () => requireVoxTypeModule().getLocalDiagnostics(),
  shareLocalDiagnostics: () => requireVoxTypeModule().shareLocalDiagnostics(),
  addListener: <EventName extends keyof VoxTypeNativeModuleEvents>(
    eventName: EventName,
    listener: VoxTypeNativeModuleEvents[EventName],
  ) => requireVoxTypeModule().addListener(eventName, listener),
};

export default VoxTypeNative;
