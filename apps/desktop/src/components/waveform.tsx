import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import clsx from 'clsx';

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
  const count = overlay ? 13 : large ? 37 : 23;
  const clampedLevel = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  const [samples, setSamples] = useState<number[]>(() => Array<number>(count).fill(0));
  const current = useRef(clampedLevel);
  const reduced = useReducedMotion();

  useEffect(() => {
    current.current = clampedLevel;
  }, [clampedLevel]);

  useEffect(() => {
    if (!active || reduced) return;
    const tick = window.setInterval(() => {
      if (!document.hidden) {
        setSamples((previous) => [
          ...previous.slice(Math.max(1, previous.length - count + 1)),
          current.current,
        ]);
      }
    }, 80);
    return () => window.clearInterval(tick);
  }, [active, count, reduced]);

  const visibleSamples =
    samples.length === count ? samples : Array<number>(count).fill(clampedLevel);

  return (
    <div
      className={clsx(
        'flex h-[30px] w-28 shrink-0 items-center justify-center gap-0.75 text-signal [&>span]:block [&>span]:h-[calc(100%-6px)] [&>span]:max-w-1.5 [&>span]:flex-[1_1_4px] [&>span]:origin-center [&>span]:rounded-full [&>span]:bg-current',
        overlay &&
          'h-5 w-11 max-w-full gap-0.5 text-inherit [&>span]:max-w-0.5 [&>span]:flex-[1_1_2px]',
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
        const scale = 0.07 + Math.min(1, Math.sqrt(amplitude) * 1.2) * envelope * 0.93;
        return (
          <motion.span
            key={index}
            aria-hidden="true"
            initial={false}
            animate={{ scaleY: scale }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: 'spring', stiffness: 310, damping: 26, mass: 0.65 }
            }
          />
        );
      })}
    </div>
  );
}
