import { z } from 'zod';

export const settingsSchema = z.object({
  language: z.enum(['en', 'en-US', 'en-GB', 'hi', 'multi', 'es', 'fr', 'de', 'pt', 'ja']),
  microphone: z.string().max(512),
  autoPaste: z.boolean(),
  cleanupEnabled: z.boolean().default(false),
  voiceDetection: z.boolean().default(true),
  vocabulary: z.array(z.string().trim().min(1).max(100)).max(100),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  language: 'en',
  microphone: '',
  autoPaste: true,
  cleanupEnabled: false,
  voiceDetection: true,
  vocabulary: [],
};
export type Phase = 'idle' | 'listening' | 'finishing' | 'cleaning' | 'done' | 'error';
export interface Session {
  sessionId: string;
  phase: Phase;
  text: string;
  interim: string;
  level: number;
  speechActive?: boolean;
  elapsedMs: number;
  message: string;
  delivery: string;
  isTest: boolean;
  external?: boolean;
  originalText?: string;
  cleanupWarning?: string;
}
export const idleSession: Session = {
  sessionId: '',
  phase: 'idle',
  text: '',
  interim: '',
  level: 0,
  elapsedMs: 0,
  message: '',
  delivery: '',
  isTest: false,
};
export interface Bootstrap {
  settings: Settings;
  snapshot: Session;
  shortcutRegistered: boolean;
  version: string;
  environment: 'development' | 'production';
  shortcutId: string;
  shortcutLabel: string;
  shortcutOptions: ShortcutOption[];
}
export interface ShortcutOption {
  id: string;
  label: string;
}
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}
export interface HistoryItem {
  id: string;
  text: string;
  originalText?: string;
  createdAt: number;
  durationMs: number;
  words: number;
  delivery: string;
  userId?: string;
  audioFile?: string;
}
export interface Microphone {
  id: string;
  name: string;
}
export interface Diagnostic {
  name: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
}
export const isActive = (phase: Phase) => ['listening', 'finishing', 'cleaning'].includes(phase);
export const duration = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function parseVocabulary(text: string): string[] {
  return [
    ...new Set(
      text
        .split('\n')
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  ];
}
