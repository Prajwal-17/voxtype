import { NativeModule, requireNativeModule } from 'expo';

import type { Snapshot, TranscriptPage, VoxTypeNativeModuleEvents } from './VoxTypeNative.types';

declare class VoxTypeNativeModule extends NativeModule<VoxTypeNativeModuleEvents> {
  getSnapshot(): Promise<Snapshot>;
  getSession(): Promise<{ token: string | null; userId: string | null }>;
  setSession(token: string, userId: string, apiUrl: string): Promise<void>;
  signOut(): Promise<void>;
  openAccessibilitySettings(): Promise<void>;
  setPreference(key: 'bubbleEnabled' | 'cleanupEnabled', value: string): Promise<void>;
  // Typed alternatives (added natively, optional on older builds).
  setBubbleEnabled?: (enabled: boolean) => Promise<void>;
  setCleanupEnabled?: (enabled: boolean) => Promise<void>;
  copyTranscript(id: string): Promise<boolean>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<void>;
  cancelRecording(): Promise<void>;
  getTranscripts(cursor: string | null): Promise<TranscriptPage>;
  syncTranscripts(): Promise<void>;
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
  getSnapshot: (): Promise<Snapshot> => requireVoxTypeModule().getSnapshot(),
  getSession: () => requireVoxTypeModule().getSession(),
  setSession: (token: string, userId: string, apiUrl: string) =>
    requireVoxTypeModule().setSession(token, userId, apiUrl),
  signOut: () => requireVoxTypeModule().signOut(),
  openAccessibilitySettings: () => requireVoxTypeModule().openAccessibilitySettings(),
  setPreference: (key: 'bubbleEnabled' | 'cleanupEnabled', value: string) =>
    requireVoxTypeModule().setPreference(key, value),
  setBubbleEnabled: (enabled: boolean) =>
    requireVoxTypeModule().setBubbleEnabled?.(enabled) ??
    requireVoxTypeModule().setPreference('bubbleEnabled', String(enabled)),
  setCleanupEnabled: (enabled: boolean) =>
    requireVoxTypeModule().setCleanupEnabled?.(enabled) ??
    requireVoxTypeModule().setPreference('cleanupEnabled', String(enabled)),
  copyTranscript: (id: string) => requireVoxTypeModule().copyTranscript(id),
  getTranscripts: (cursor: string | null) => requireVoxTypeModule().getTranscripts(cursor),
  syncTranscripts: () => requireVoxTypeModule().syncTranscripts(),
  startRecording: () => requireVoxTypeModule().startRecording(),
  cancelRecording: () => requireVoxTypeModule().cancelRecording(),
  stopRecording: () => requireVoxTypeModule().stopRecording(),
  addListener: <EventName extends keyof VoxTypeNativeModuleEvents>(
    eventName: EventName,
    listener: VoxTypeNativeModuleEvents[EventName],
  ) => requireVoxTypeModule().addListener(eventName, listener),
};

export default VoxTypeNative;
