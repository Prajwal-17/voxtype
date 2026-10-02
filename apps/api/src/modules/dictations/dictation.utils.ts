import type { Dictation, NewDictation } from '../../shared/database/schema';
import type { DictationCursor, DictationInput, DictationResponse } from './dictation.types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function countWords(text: string): number {
  const normalized = text.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

export function toNewDictation(userId: string, id: string, input: DictationInput): NewDictation {
  return {
    id,
    userId,
    text: input.text,
    originalText: input.originalText ?? null,
    createdAt: new Date(input.createdAt),
    durationMs: input.durationMs,
    wordCount: countWords(input.text),
    source: input.source,
  };
}

export function toDictationResponse(item: Dictation): DictationResponse {
  return {
    id: item.id,
    text: item.text,
    originalText: item.originalText ?? undefined,
    createdAt: item.createdAt.getTime(),
    updatedAt: item.updatedAt.getTime(),
    durationMs: item.durationMs,
    words: item.wordCount,
    source: item.source,
  };
}

export function encodeCursor(cursor: DictationCursor): string {
  const bytes = encoder.encode(JSON.stringify(cursor));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function decodeCursor(value: string): DictationCursor | null {
  try {
    const padded = value
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(decoder.decode(bytes));

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('createdAt' in parsed) ||
      !('id' in parsed) ||
      typeof parsed.createdAt !== 'number' ||
      !Number.isSafeInteger(parsed.createdAt) ||
      typeof parsed.id !== 'string'
    ) {
      return null;
    }

    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}
