import { describe, expect, it } from 'vitest';
import { captureShortcut } from '../src/lib/shortcuts';

const keyEvent = (key: string, modifiers: Partial<KeyboardEvent> = {}) => ({
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...modifiers,
});

describe('custom shortcut capture', () => {
  it('captures a modified key in the backend accelerator order', () => {
    expect(captureShortcut(keyEvent('K', { ctrlKey: true, shiftKey: true }))).toEqual({
      id: 'custom:<Control><Shift>k',
      label: 'Ctrl Shift K',
    });
    expect(captureShortcut(keyEvent(' ', { altKey: true }))).toEqual({
      id: 'custom:<Alt>space',
      label: 'Alt Space',
    });
    expect(captureShortcut(keyEvent('!', { ctrlKey: true, shiftKey: true }))).toEqual({
      id: 'custom:<Control><Shift>1',
      label: 'Ctrl Shift 1',
    });
  });

  it('accepts function keys and rejects plain typing or modifier-only keys', () => {
    expect(captureShortcut(keyEvent('F9'))?.id).toBe('custom:F9');
    expect(captureShortcut(keyEvent('k'))).toBeNull();
    expect(captureShortcut(keyEvent('Control', { ctrlKey: true }))).toBeNull();
  });
});
