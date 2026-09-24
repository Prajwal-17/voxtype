/** Platform-independent contracts. Session implementation follows the feasibility gate. */
export type DictationState = 'idle' | 'connecting' | 'listening' | 'finishing' | 'error';
export interface TranscriptEvent {
  sessionId: string;
  text: string;
  final: boolean;
}

