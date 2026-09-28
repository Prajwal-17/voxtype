export type AppEnvironment = 'development' | 'production';

const configured: 'development' | 'production' | undefined = import.meta.env.VITE_VOXTYPE_ENV;

export const appEnvironment: AppEnvironment =
  configured === 'development' || configured === 'production' ? configured : 'development';

export const isDevelopment = appEnvironment === 'development';
export const appName = isDevelopment ? 'VoxType Dev' : 'VoxType';
export const shortcutId = isDevelopment ? 'ctrl-shift-space' : 'right-alt';
export const shortcutLabel = isDevelopment ? 'Ctrl Shift Space' : 'Right Alt';
