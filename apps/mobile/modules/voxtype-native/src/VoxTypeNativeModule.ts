import { NativeModule, requireNativeModule } from 'expo';

import type { Snapshot, VoxTypeNativeModuleEvents } from './VoxTypeNative.types';

declare class VoxTypeNativeModule extends NativeModule<VoxTypeNativeModuleEvents> {
  getSnapshot(): Promise<Snapshot>;
  getSession(): Promise<{ token: string | null; userId: string | null }>;
  setSession(token: string, userId: string, apiUrl: string): Promise<void>;
  signOut(): Promise<void>;
  openAccessibilitySettings(): Promise<void>;
  setPreference(
    key: 'bubbleEnabled' | 'cleanupEnabled' | 'audioLimit',
    value: string,
  ): Promise<void>;
  copyTranscript(id: string): Promise<boolean>;
  stopRecording(): Promise<void>;
}

export default requireNativeModule<VoxTypeNativeModule>('VoxTypeNative');
