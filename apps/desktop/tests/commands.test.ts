import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLauncherCommand } from '../src/commands.ts';

test('accepts only the three Linux launcher actions', () => {
  assert.equal(parseLauncherCommand('toggle'), 'toggle');
  assert.equal(parseLauncherCommand('--flow-command=settings'), 'settings');
  assert.equal(parseLauncherCommand('cancel'), 'cancel');
  assert.equal(parseLauncherCommand('quit'), undefined);
  assert.equal(parseLauncherCommand(undefined), undefined);
});
