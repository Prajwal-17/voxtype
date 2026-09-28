type ShortcutKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'
>;

export interface CapturedShortcut {
  id: string;
  label: string;
}

const keyNames: Record<string, [string, string]> = {
  ' ': ['space', 'Space'],
  Enter: ['Return', 'Enter'],
  Backspace: ['BackSpace', 'Backspace'],
  Delete: ['Delete', 'Delete'],
  Insert: ['Insert', 'Insert'],
  Home: ['Home', 'Home'],
  End: ['End', 'End'],
  PageUp: ['Page_Up', 'Page Up'],
  PageDown: ['Page_Down', 'Page Down'],
  ArrowUp: ['Up', 'Up'],
  ArrowDown: ['Down', 'Down'],
  ArrowLeft: ['Left', 'Left'],
  ArrowRight: ['Right', 'Right'],
  Tab: ['Tab', 'Tab'],
  Escape: ['Escape', 'Esc'],
  ',': ['comma', ','],
  '.': ['period', '.'],
  '/': ['slash', '/'],
  ';': ['semicolon', ';'],
  "'": ['apostrophe', "'"],
  '[': ['bracketleft', '['],
  ']': ['bracketright', ']'],
  '\\': ['backslash', '\\'],
  '-': ['minus', '-'],
  '=': ['equal', '='],
  '`': ['grave', '`'],
  '!': ['1', '1'],
  '@': ['2', '2'],
  '#': ['3', '3'],
  $: ['4', '4'],
  '%': ['5', '5'],
  '^': ['6', '6'],
  '&': ['7', '7'],
  '*': ['8', '8'],
  '(': ['9', '9'],
  ')': ['0', '0'],
  ':': ['semicolon', ';'],
  '"': ['apostrophe', "'"],
  '{': ['bracketleft', '['],
  '}': ['bracketright', ']'],
  '|': ['backslash', '\\'],
  _: ['minus', '-'],
  '+': ['equal', '='],
  '~': ['grave', '`'],
  '<': ['comma', ','],
  '>': ['period', '.'],
  '?': ['slash', '/'],
};

export function captureShortcut(event: ShortcutKeyEvent): CapturedShortcut | null {
  if (['Control', 'Alt', 'AltGraph', 'Shift', 'Meta', 'OS', 'Super'].includes(event.key)) {
    return null;
  }
  const functionKey = /^F(?:[1-9]|1\d|2[0-4])$/.test(event.key);
  const letterOrDigit = /^[a-z0-9]$/i.test(event.key);
  const [key, label] = functionKey
    ? [event.key, event.key]
    : letterOrDigit
      ? [event.key.toLowerCase(), event.key.toUpperCase()]
      : (keyNames[event.key] ?? []);
  if (!key || !label) return null;

  const modifiers = [
    event.ctrlKey && ['<Control>', 'Ctrl'],
    event.altKey && ['<Alt>', 'Alt'],
    event.shiftKey && ['<Shift>', 'Shift'],
    event.metaKey && ['<Super>', 'Super'],
  ].filter((modifier): modifier is string[] => Boolean(modifier));
  if (modifiers.length === 0 && !functionKey) return null;
  return {
    id: `custom:${modifiers.map(([token]) => token).join('')}${key}`,
    label: [...modifiers.map(([, name]) => name), label].join(' '),
  };
}
