import { Check, CircleAlert, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { api, useRecording, useSession } from '../lib/api';
import { isActive, type Session } from '../lib/types';
import { Waveform } from './waveform';

export function VoiceOverlay({ preview }: { preview?: Session }) {
  const { data } = useSession();
  const session = preview ?? data;
  const { stop, cancel } = useRecording();
  const active = isActive(session.phase);
  const finishing = session.phase === 'finishing' || session.phase === 'cleaning';
  const failed = session.phase === 'error';
  const done = session.phase === 'done';
  const reduced = useReducedMotion();
  const status = failed
    ? session.message
    : finishing
      ? session.phase === 'cleaning'
        ? 'Cleaning up dictation'
        : 'Finishing transcription'
      : active
        ? 'Recording'
        : done
          ? 'Transcript ready'
          : 'Not recording';
  const visibleStatus = failed
    ? 'Recording interrupted'
    : finishing
      ? session.phase === 'cleaning'
        ? 'Cleaning up'
        : 'Finishing'
      : active
        ? session.speechActive
          ? 'Speech detected'
          : 'Listening'
        : done
          ? 'Transcript ready'
          : 'Ready';
  const recover = () => {
    void api
      .openMain()
      .catch(() => toast.error('Flow couldn’t open the main window. Try again from the app icon.'));
  };
  return (
    <div
      className={cn(
        'relative isolate grid h-16 grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-2 rounded-full bg-overlay p-2 text-overlay-text shadow-floating scheme-dark',
        'before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-overlay-line before:opacity-80',
        preview ? 'mx-auto mt-2 w-full' : 'm-2 w-[calc(100%-1rem)]',
      )}
      data-phase={session.phase}
      data-speaking={session.speechActive}
      aria-label="Voice recording controls"
      aria-busy={finishing}
    >
      <button
        className="inline-flex size-8 items-center justify-center rounded-full border-0 bg-overlay-raised p-0 text-overlay-text transition-[transform,background-color] duration-150 ease-out enabled:active:scale-[.97] enabled:hover:bg-navigation-line enabled:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-overlay-text disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
        title={active ? 'Cancel dictation' : 'Dismiss overlay'}
        aria-label={active ? 'Cancel dictation' : 'Dismiss overlay'}
        disabled={!!preview || cancel.isPending}
        onClick={() =>
          active
            ? cancel.mutate()
            : void api
                .dismiss()
                .catch(() => toast.error('The overlay couldn’t close. Use the main Flow window.'))
        }
      >
        <X size={15} strokeWidth={1.8} />
      </button>
      <div
        className={cn(
          'relative flex h-full min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden text-overlay-text',
          failed && 'text-overlay-danger',
        )}
      >
        {finishing ? (
          <div
            className="flex h-7 w-24 shrink-0 items-center justify-center gap-1"
            aria-hidden="true"
          >
            {Array.from({ length: 7 }, (_, index) => (
              <motion.i
                key={index}
                className="w-0.5 shrink-0 rounded-[3px] bg-white"
                style={{ height: `${6 + (1 - Math.abs(index - 3) / 3) * 8}px` }}
                initial={false}
                animate={
                  reduced
                    ? { scaleY: 0.65, opacity: 0.7 }
                    : { scaleY: [0.35, 1, 0.35], opacity: [0.45, 1, 0.45] }
                }
                transition={
                  reduced
                    ? { duration: 0 }
                    : { duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: index * -0.075 }
                }
              />
            ))}
          </div>
        ) : failed ? (
          <CircleAlert size={16} />
        ) : done ? (
          <Check size={17} />
        ) : (
          <Waveform level={session.level} active={session.phase === 'listening'} overlay />
        )}
        <span
          className="max-w-full truncate text-caption leading-none font-medium"
          aria-hidden="true"
        >
          {visibleStatus}
        </span>
      </div>
      <button
        className="inline-flex size-8 items-center justify-center rounded-full border-0 bg-overlay-text p-0 text-navigation transition-[transform,background-color] duration-150 ease-out enabled:active:scale-[.97] enabled:hover:bg-inverse-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-overlay-text disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
        title={failed || done ? 'Open transcript' : 'Finish dictation'}
        aria-label={failed || done ? 'Open Flow to recover transcript' : 'Finish dictation'}
        disabled={!!preview || finishing || stop.isPending || (!active && !failed && !done)}
        onClick={() => (failed || done ? recover() : stop.mutate())}
      >
        <Check size={16} strokeWidth={2} />
      </button>

      <span className="sr-only" role={failed ? 'alert' : 'status'}>
        {status}
      </span>
    </div>
  );
}
