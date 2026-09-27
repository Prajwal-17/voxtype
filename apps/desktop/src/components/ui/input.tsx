import * as React from 'react';
import { cn } from '../../lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'w-full min-w-0 border-0 bg-transparent py-1.5 text-ui text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
