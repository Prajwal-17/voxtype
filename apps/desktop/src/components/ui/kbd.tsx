import * as React from 'react';
import { cn } from '../../lib/utils';

function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex min-h-[23px] items-center justify-center rounded border border-line-strong bg-surface px-1.5 font-sans text-caption text-muted shadow-kbd',
        'group-[.sidebar]:border-graphite-line group-[.sidebar]:bg-graphite-raised group-[.sidebar]:text-inverse group-[.sidebar]:shadow-none',
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
