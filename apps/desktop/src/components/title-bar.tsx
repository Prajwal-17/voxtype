import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { toast } from 'sonner';
import { CopyIcon, MinusIcon, SquareIcon, XIcon } from './icons';
import { appName } from '../lib/environment';

export function TitleBar() {
  const native = isTauri();
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!native) return;
    const window = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const refresh = () =>
      void window
        .isMaximized()
        .then((value) => {
          if (!disposed) setMaximized(Boolean(value));
        })
        .catch(() => {});
    refresh();
    void window
      .onResized(refresh)
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [native]);
  if (!native) return null;
  const window = getCurrentWindow();
  const run = (action: () => Promise<void>) =>
    void action().catch(() => toast.error('Couldn’t change the window. Try again.'));
  const control =
    'flex h-11 w-12 items-center justify-center text-inverse/80 transition-colors hover:bg-white/10 hover:text-inverse focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-inverse';
  return (
    <header
      className="flex h-11 shrink-0 select-none items-center bg-accent text-inverse"
      aria-label="Window title bar"
    >
      <div
        data-tauri-drag-region
        className="flex h-full flex-1 items-center gap-2.5 px-5 text-caption font-semibold tracking-wide"
      >
        <img src="/voxtype.svg" alt="" className="pointer-events-none size-5" />
        <span className="pointer-events-none">{appName}</span>
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
        title={maximized ? 'Restore window' : 'Maximize window'}
        onClick={() => run(() => window.toggleMaximize())}
      >
        {maximized ? <CopyIcon size={16} weight="bold" /> : <SquareIcon size={15} weight="bold" />}
      </button>
      <button
        type="button"
        className={`${control} hover:bg-danger hover:text-white`}
        aria-label="Close window"
        onClick={() => run(() => window.close())}
      >
        <XIcon size={16} weight="bold" />
      </button>
    </header>
  );
}
