import {
  ArrowUpRightIcon,
  WarningCircleIcon,
  FileTextIcon,
  CircleNotchIcon,
  StopIcon,
  XIcon,
} from './icons';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { api, useRecording, useSession } from '../lib/api';
import { isActive, type Session } from '../lib/types';
import { isDevelopment } from '../lib/environment';
import { Waveform } from './waveform';

export function VoiceOverlay({ preview }: { preview?: Session }) {
  const { data } = useSession();
  const session = preview ?? data;
  const { stop, cancel } = useRecording();
  const active = isActive(session.phase);
  const finishing = session.phase === 'finishing' || session.phase === 'cleaning';
  const failed = session.phase === 'error';
  const done = session.phase === 'done';
  const status = failed
    ? session.message
    : finishing
      ? session.phase === 'cleaning'
        ? 'Cleaning up dictation'
        : 'Finishing transcription'
      : active
        ? session.speechActive
          ? 'Speech detected'
          : 'Listening'
        : done
          ? 'Transcript ready'
          : 'Not recording';
  const recover = () => {
    void api
      .openMain()
      .catch(() =>
        toast.error('VoxType couldn’t open the main window. Try again from the app icon.'),
      );
  };
  return (
    <div
      className={cn(
        'relative isolate grid h-10 grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-1 rounded-full bg-overlay p-1 text-overlay-text shadow-floating scheme-dark',
        'before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-overlay-line before:opacity-80',
        preview
          ? 'mx-auto mt-2 w-[272px]'
          : isDevelopment
            ? 'mx-2 mt-3 w-[calc(100%-1rem)]'
            : 'm-2 w-[calc(100%-1rem)]',
      )}
      data-phase={session.phase}
      data-speaking={session.speechActive}
      aria-label={
        isDevelopment ? 'Development voice recording controls' : 'Voice recording controls'
      }
      aria-busy={finishing}
    >
      {isDevelopment && (
        <span
          aria-hidden="true"
          className="absolute -top-[7px] left-1/2 z-10 -translate-x-1/2 rounded-menu-item bg-warning-soft px-1 py-0.5 text-[0.5rem] font-bold leading-none tracking-[.08em] text-warning"
        >
          DEV
        </span>
      )}
      <button
        className="inline-flex size-8 items-center justify-center rounded-full border-0 bg-overlay-raised p-0 text-overlay-text transition-[transform,background-color] duration-150 ease-out enabled:active:scale-[.97] enabled:hover:bg-overlay-line enabled:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-overlay-text disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
        title={active ? 'Cancel dictation' : 'Dismiss overlay'}
        aria-label={active ? 'Cancel dictation' : 'Dismiss overlay'}
        disabled={!!preview || cancel.isPending}
        onClick={() =>
          active
            ? cancel.mutate()
            : void api
                .dismiss()
                .catch(() =>
                  toast.error('The overlay couldn’t close. Use the main VoxType window.'),
                )
        }
      >
        <XIcon size={16} aria-hidden="true" />
      </button>
      <div
        className={cn(
          'relative flex h-full min-w-0 items-center justify-center overflow-hidden text-overlay-text',
          failed && 'text-overlay-danger',
        )}
      >
        {finishing ? (
          <CircleNotchIcon
            size={20}
            className="animate-spin motion-reduce:animate-none"
            data-signal="loading"
            aria-hidden="true"
          />
        ) : failed ? (
          <WarningCircleIcon size={16} aria-hidden="true" />
        ) : done ? (
          <FileTextIcon size={16} aria-hidden="true" />
        ) : (
          <Waveform level={session.level} active={session.phase === 'listening'} overlay />
        )}
      </div>
      <button
        className="inline-flex size-8 items-center justify-center rounded-full border-0 bg-overlay-text p-0 text-overlay transition-[transform,background-color] duration-150 ease-out enabled:active:scale-[.97] enabled:hover:bg-inverse-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-overlay-text disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
        title={failed || done ? 'Open transcript' : 'Finish dictation'}
        aria-label={failed || done ? 'Open VoxType to recover transcript' : 'Finish dictation'}
        disabled={!!preview || finishing || stop.isPending || (!active && !failed && !done)}
        onClick={() => (failed || done ? recover() : stop.mutate())}
      >
        {failed || done ? (
          <ArrowUpRightIcon size={16} aria-hidden="true" />
        ) : (
          <StopIcon size={14} weight="fill" aria-hidden="true" />
        )}
      </button>

      <span className="sr-only" role={failed ? 'alert' : 'status'}>
        {status}
      </span>
    </div>
  );
}
