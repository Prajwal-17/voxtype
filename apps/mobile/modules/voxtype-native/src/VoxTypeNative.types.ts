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
  microphoneGranted: boolean;
  bubbleEnabled: boolean;
  cleanupEnabled: boolean;
  audioLimit: 10;
  status:
    'idle' | 'connecting' | 'listening' | 'processing' | 'saved' | 'microphone_permission_needed';
  dictations: Dictation[];
};

export type VoxTypeNativeModuleEvents = { onChange: (params: { changed: boolean }) => void };
