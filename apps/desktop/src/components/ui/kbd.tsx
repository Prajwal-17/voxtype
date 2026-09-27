import * as React from 'react';
import { cn } from '../../lib/utils';

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'pointer-events-none inline-flex h-5 w-fit min-w-5 select-none items-center justify-center gap-1 rounded-sm bg-subtle px-1 align-middle font-sans text-caption font-medium text-muted',
        "[&_svg:not([class*='size-'])]:size-3",
        'group-[.sidebar]:bg-navigation group-[.sidebar]:text-inverse',
        className,
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
