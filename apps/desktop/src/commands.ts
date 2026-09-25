export type LauncherCommand = 'toggle' | 'cancel' | 'settings';

export function parseLauncherCommand(value: string | undefined): LauncherCommand | undefined {
  const command = value?.trim().replace(/^--flow-command=/, '');
  return command === 'toggle' || command === 'cancel' || command === 'settings' ? command : undefined;
}
