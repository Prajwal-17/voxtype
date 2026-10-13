export type Dictation = {
  id: string;
  userId: string;
  text: string;
  originalText: string | null;
  createdAt: number;
  updatedAt: number;
  durationMs: number;
  wordCount: number;
  delivery: 'saved' | 'copied' | 'pasted';
  audioFile: string | null;
};

export type Snapshot = {
  accessibilityEnabled: boolean;
  accessibilityConnected: boolean;
  microphoneGranted: boolean;
  bubbleEnabled: boolean;
  cleanupEnabled: boolean;
  vocabulary?: string[];
  syncing: boolean;
  syncError: string;
  audioLimit: 10;
  appHealth?: {
    appName: string | null;
    packageName: string;
    appVersion: string | null;
    manufacturer: string;
    model: string;
    androidVersion: string;
    lastNativeIssue: { stage: string; exception: string; timestamp: number } | null;
    lastExit: { reason: string; code: number; timestamp: number } | null;
  };
  // Optional so the JS UI can still run on older installed native builds.
  bubbleHealth?: {
    device: {
      manufacturer: string;
      model: string;
      androidVersion: string;
      appVersion: string | null;
    };
    foregroundMode: 'none' | 'bubble' | 'microphone';
    foregroundError: string | null;
    hiddenReason: string;
    batteryOptimizationsIgnored: boolean | null;
    backgroundRestricted: boolean | null;
    lastExit: { reason: string; code: number; timestamp: number } | null;
    events: { event: string; timestamp: number }[];
  };
  status:
    | 'idle'
    | 'connecting'
    | 'listening'
    | 'processing'
    | 'saved'
    | 'error'
    | 'microphone_permission_needed';
  inApp: {
    status: 'idle' | 'listening' | 'processing' | 'saved' | 'error';
    text: string;
    error: string;
    durationMs: number;
    level?: number;
  };
};

export type VoxTypeNativeModuleEvents = {
  onChange: (params: { changed: boolean }) => void;
  onAudioLevel: (params: { level: number }) => void;
};

export type TranscriptPage = { items: Dictation[]; nextCursor: string | null };
