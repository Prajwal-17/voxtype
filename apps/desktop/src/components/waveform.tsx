import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '../lib/utils';

/** Rolling microphone history with fast level-driven transitions. */
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
  const count = overlay ? 23 : large ? 37 : 23;
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
      overlay ? 45 : 65,
    );
    return () => window.clearInterval(tick);
  }, [active, count, overlay, reduced]);

  const visibleSamples =
    samples.length === count ? samples : Array<number>(count).fill(clampedLevel);

  return (
    <div
      className={cn(
        'flex h-[30px] w-28 shrink-0 items-center justify-center gap-0.75 text-accent',
        overlay && 'h-9 w-full max-w-[148px] gap-0.75 text-overlay-wave',
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
        const intensity = Math.min(1, Math.sqrt(amplitude) * 2.3) * envelope;
        const scale = 0.1 + intensity * 0.9;
        return (
          <span
            key={index}
            className={cn(
              'block origin-center rounded-full bg-current transition-[transform,opacity] duration-75 ease-out motion-reduce:transition-none',
              overlay
                ? 'h-[34px] max-w-[5px] flex-[1_1_5px]'
                : 'h-[calc(100%-6px)] max-w-1.5 flex-[1_1_4px]',
            )}
            aria-hidden="true"
            style={{
              transform: `scaleY(${scale})`,
              opacity: active ? 0.4 + intensity * 0.6 : 0.32,
            }}
          />
        );
      })}
    </div>
  );
}
