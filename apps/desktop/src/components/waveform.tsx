import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../lib/utils';

/** Spring-driven bars, following a rolling history of real microphone samples. */
export function Waveform({
  level,
  active,
  large = false,
  overlay = false,
}: {
  level: number;
  active: boolean;
  large?: boolean;
  overlay?: boolean;
}) {
  const count = overlay ? 21 : large ? 37 : 23;
  const clampedLevel = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  const [samples, setSamples] = useState<number[]>(() => Array<number>(count).fill(0));
  const current = useRef(clampedLevel);
  const reduced = useReducedMotion();

  useEffect(() => {
    current.current = clampedLevel;
  }, [clampedLevel]);

  useEffect(() => {
    setSamples(Array<number>(count).fill(active ? current.current : 0));
  }, [active, count]);

  useEffect(() => {
    if (!active || reduced) return;
    const tick = window.setInterval(
      () => {
        if (!document.hidden) {
          setSamples((previous) => [
            ...previous.slice(Math.max(1, previous.length - count + 1)),
            current.current,
          ]);
        }
      },
      overlay ? 65 : 80,
    );
    return () => window.clearInterval(tick);
  }, [active, count, overlay, reduced]);

  const visibleSamples =
    samples.length === count ? samples : Array<number>(count).fill(clampedLevel);

  return (
    <div
      className={cn(
        'flex h-[30px] w-28 shrink-0 items-center justify-center gap-0.75 text-accent [&>span]:block [&>span]:h-[calc(100%-6px)] [&>span]:max-w-1.5 [&>span]:flex-[1_1_4px] [&>span]:origin-center [&>span]:rounded-full [&>span]:bg-current',
        overlay &&
          'h-7 w-24 max-w-full gap-0.5 text-inherit [&>span]:max-w-0.5 [&>span]:flex-[1_1_2px]',
        large &&
          !overlay &&
          'h-[104px] w-[184px] text-accent max-[1050px]:h-[72px] max-[1050px]:w-[148px] max-[700px]:h-16 max-[700px]:w-[100px]',
      )}
      role="meter"
      aria-label="Microphone level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round((active ? clampedLevel : 0) * 100)}
    >
      {visibleSamples.map((sample, index) => {
        const amplitude = active ? (reduced ? clampedLevel : sample) : 0;
        // Perceptual gain makes quiet speech readable without fabricating activity.
        const envelope = overlay ? 0.55 + 0.45 * Math.sin((index / (count - 1)) * Math.PI) : 1;
        const intensity = Math.min(1, Math.sqrt(amplitude) * 1.2) * envelope;
        const scale = 0.1 + intensity * 0.9;
        return (
          <motion.span
            key={index}
            aria-hidden="true"
            initial={false}
            animate={{ scaleY: scale, opacity: active ? 0.4 + intensity * 0.6 : 0.32 }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: 'spring', stiffness: 260, damping: 24, mass: 0.72 }
            }
          />
        );
      })}
    </div>
  );
}
