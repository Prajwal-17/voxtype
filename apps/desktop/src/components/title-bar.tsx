import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { toast } from 'sonner';
import { MinusIcon, SquareIcon, XIcon } from './icons';
import { appName } from '../lib/environment';

export function TitleBar() {
  if (!isTauri()) return null;
  const window = getCurrentWindow();
  const run = (action: () => Promise<void>) =>
    void action().catch(() => toast.error('Couldn’t change the window. Try again.'));
  const control =
    'flex h-11 w-12 items-center justify-center text-muted hover:bg-accent-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent';
  return (
    <header
      className="flex h-11 shrink-0 select-none items-center border-b border-line bg-navigation text-ink"
      aria-label="Window title bar"
    >
      <div
        data-tauri-drag-region
        className="flex h-full flex-1 items-center px-5 text-caption font-medium"
      >
        {appName}
      </div>
      <button
        type="button"
        className={control}
        aria-label="Minimize window"
        onClick={() => run(() => window.minimize())}
      >
        <MinusIcon size={16} weight="bold" />
      </button>
      <button
        type="button"
        className={control}
        aria-label="Maximize or restore window"
        onClick={() => run(() => window.toggleMaximize())}
      >
        <SquareIcon size={15} weight="bold" />
      </button>
      <button
        type="button"
        className={`${control} hover:bg-danger-soft hover:text-danger`}
        aria-label="Close window"
        onClick={() => run(() => window.close())}
      >
        <XIcon size={16} weight="bold" />
      </button>
    </header>
  );
}
