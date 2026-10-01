import { registerWebModule, NativeModule } from 'expo';

import type { Snapshot, VoxTypeNativeModuleEvents } from './VoxTypeNative.types';

// Web exists solely for the requested UI preview. Every transcript below is dummy data.
const snapshot: Snapshot = {
  accessibilityEnabled: true,
  microphoneGranted: true,
  bubbleEnabled: true,
  cleanupEnabled: false,
  audioLimit: 10,
  status: 'idle',
  dictations: [
    {
      id: 'demo-1',
      userId: 'demo',
      text: 'Send the revised notes after lunch.',
      originalText: 'Send the revised notes after lunch.',
      createdAt: Date.now() - 46 * 60_000,
      updatedAt: Date.now() - 46 * 60_000,
      durationMs: 4300,
      wordCount: 7,
      delivery: 'pasted',
      audioFile: 'dummy-recording.wav',
    },
    {
      id: 'demo-2',
      userId: 'demo',
      text: 'The meeting starts at nine tomorrow.',
      originalText: 'The meeting starts at nine tomorrow.',
      createdAt: Date.now() - 26 * 60 * 60_000,
      updatedAt: Date.now() - 26 * 60 * 60_000,
      durationMs: 5100,
      wordCount: 7,
      delivery: 'saved',
      audioFile: 'dummy-recording.wav',
    },
  ],
};

class VoxTypeNativeModule extends NativeModule<VoxTypeNativeModuleEvents> {
  getSnapshot(): Promise<Snapshot> {
    return Promise.resolve({ ...snapshot, dictations: [...snapshot.dictations] });
  }
  getSession() {
    return Promise.resolve({ token: 'dummy-preview-token', userId: 'demo' });
  }
  setSession() {
    return Promise.resolve();
  }
  signOut() {
    return Promise.resolve();
  }
  openAccessibilitySettings() {
    return Promise.resolve();
  }
  setPreference(key: 'bubbleEnabled' | 'cleanupEnabled' | 'audioLimit', value: string) {
    if (key === 'audioLimit') snapshot.audioLimit = Number(value) as 5 | 10 | 15;
    else snapshot[key] = value === 'true';
    return Promise.resolve();
  }
  copyTranscript(id: string) {
    return Promise.resolve(snapshot.dictations.some((item) => item.id === id));
  }
  stopRecording() {
    snapshot.status = 'processing';
    return Promise.resolve();
  }
}

const WebVoxTypeNativeModule = registerWebModule(VoxTypeNativeModule, 'VoxTypeNative');

export function getVoxTypeNative() {
  return WebVoxTypeNativeModule;
}

export function isVoxTypeNativeAvailable() {
  return true;
}

export default WebVoxTypeNativeModule;
