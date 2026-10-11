import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { toast } from 'sonner';

export function TitleBar() {
  if (!isTauri()) return null;
  const window = getCurrentWindow();
  const run = (action: () => Promise<void>) =>
    void action().catch(() => toast.error('Couldn’t change the window. Try again.'));
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-10 select-none items-center border-b border-line bg-navigation text-ink">
      <div data-tauri-drag-region className="flex h-full flex-1 items-center px-4 text-caption">
        VoxType
      </div>
      <button
        className="h-10 w-12 hover:bg-accent-soft"
        aria-label="Minimize window"
        onClick={() => run(() => window.minimize())}
      >
        −
      </button>
      <button
        className="h-10 w-12 hover:bg-accent-soft"
        aria-label="Maximize or restore window"
        onClick={() => run(() => window.toggleMaximize())}
      >
        □
      </button>
      <button
        className="h-10 w-12 hover:bg-red-100"
        aria-label="Close window"
        onClick={() => run(() => window.close())}
      >
        ×
      </button>
    </header>
  );
}
