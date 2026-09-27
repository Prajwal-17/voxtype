import { Check, CircleAlert, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import clsx from 'clsx';
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
  const recover = () => {
    void api.openMain().catch((error) => toast.error(String(error)));
  };
  return (
    <div
      className={clsx(
        'relative isolate m-2 grid h-9 w-[120px] grid-cols-[24px_minmax(0,1fr)_24px] items-center gap-1.5 rounded-[18px] bg-[#080b09] p-1.5 text-white shadow-floating scheme-dark before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-[#39453d] before:opacity-80',
        preview && 'mx-auto',
      )}
      data-phase={session.phase}
      data-speaking={session.speechActive}
      aria-label="Voice recording controls"
      aria-busy={finishing}
    >
      <button
        className="inline-flex size-6 items-center justify-center rounded-full border-0 bg-[#414442] p-0 text-[#e8eae8] transition-[transform,background-color] duration-150 ease-out enabled:active:scale-[.97] enabled:hover:bg-[#535754] enabled:hover:text-white disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
        title={active ? 'Cancel dictation' : 'Dismiss overlay'}
        aria-label={active ? 'Cancel dictation' : 'Dismiss overlay'}
        disabled={!!preview || cancel.isPending}
        onClick={() =>
          active ? cancel.mutate() : void api.dismiss().catch((error) => toast.error(String(error)))
        }
      >
        <X size={16} strokeWidth={1.8} />
      </button>
      <div
        className={clsx(
          'relative flex h-full min-w-0 items-center justify-center overflow-hidden text-white',
          failed && 'text-[#e7a398]',
        )}
      >
        {finishing ? (
          <div className="flex h-5 w-full items-center justify-center gap-0.75" aria-hidden="true">
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
      </div>
      <button
        className="inline-flex size-6 items-center justify-center rounded-full border-0 bg-white p-0 text-[#151815] transition-transform duration-150 ease-out enabled:active:scale-[.97] disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
        title={failed || done ? 'Open transcript' : 'Finish dictation'}
        aria-label={failed || done ? 'Open Flow to recover transcript' : 'Finish dictation'}
        disabled={!!preview || finishing || stop.isPending || (!active && !failed && !done)}
        onClick={() => (failed || done ? recover() : stop.mutate())}
      >
        <Check size={17} strokeWidth={2} />
      </button>

      <span className="sr-only" role={failed ? 'alert' : 'status'}>
        {status}
      </span>
    </div>
  );
}
