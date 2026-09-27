import * as SwitchPrimitives from '@radix-ui/react-switch';
import * as React from 'react';
import { cn } from '../../lib/utils';

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      'peer relative h-6 w-10 shrink-0 cursor-pointer rounded-full border-0 bg-line-strong p-0.5 transition-colors duration-150 data-[state=checked]:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45',
      className,
    )}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'block size-5 rounded-full bg-surface shadow transition-transform duration-150 data-[state=checked]:translate-x-4',
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
