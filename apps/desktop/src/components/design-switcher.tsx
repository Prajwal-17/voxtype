import { CheckIcon, CaretDownIcon, CaretUpIcon, PaletteIcon } from './icons';
import { useState } from 'react';
import { designs, type Design } from '../lib/design-trial';
import { cn } from '../lib/utils';

export function DesignSwitcher({
  design,
  onChange,
}: {
  design: Design;
  onChange: (design: Design) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <section
      aria-label="Desktop design trial"
      className="design-switcher fixed bottom-5 left-1/2 z-50 w-[650px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-[20px] p-2 shadow-[0_8px_40px_#0003,0_1px_3px_#0002]"
    >
      <div className="flex min-h-10 items-center gap-2 px-3">
        <PaletteIcon size={16} aria-hidden="true" />
        <span className="text-xs font-semibold">Design lab</span>
        <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-[#b8c2b8]">
          DESKTOP TRIAL
        </span>
        <span className="ml-auto text-xs text-[#b8c2b8]" aria-live="polite">
          {design.name}
        </span>
        <button
          type="button"
          className="lab-control -mr-2 flex size-10 items-center justify-center rounded-lg"
          aria-label={expanded ? 'Collapse design selector' : 'Expand design selector'}
          aria-expanded={expanded}
          aria-controls="design-options"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <CaretDownIcon size={16} aria-hidden="true" />
          ) : (
            <CaretUpIcon size={16} aria-hidden="true" />
          )}
        </button>
      </div>
      <div id="design-options" hidden={!expanded}>
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Choose a desktop design">
          {designs.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={design.id === item.id}
              onClick={() => onChange(item)}
              className={cn(
                'lab-control flex min-h-[62px] flex-col gap-2 rounded-xl border px-3 py-2.5 text-left',
                design.id === item.id
                  ? 'border-[#d3ef87] bg-[#323b2c]'
                  : 'border-white/10 bg-white/5',
              )}
            >
              <span className="flex w-full items-center gap-2 text-xs font-medium">
                <span className="text-[#b8c2b8]">0{index + 1}</span>
                {item.name}
                {design.id === item.id && (
                  <CheckIcon size={12} className="ml-auto text-[#d3ef87]" aria-hidden="true" />
                )}
              </span>
              <span className="flex gap-1" aria-hidden="true">
                {item.colors.map((color) => (
                  <span
                    key={color}
                    className="h-1.5 w-7 rounded-full ring-1 ring-inset ring-white/10"
                    style={{ background: color }}
                  />
                ))}
              </span>
            </button>
          ))}
        </div>
        <p className="px-3 pt-2 pb-1 text-[11px] text-[#b8c2b8]">{design.note}</p>
      </div>
    </section>
  );
}
