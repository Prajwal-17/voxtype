/* eslint-disable react-refresh/only-export-components -- standard CN pattern: variants + component */
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import * as React from 'react';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control border border-transparent font-medium transition-[transform,background-color,color,border-color,box-shadow] duration-150 ease-out enabled:active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  {
    variants: {
      variant: {
        default: 'bg-accent text-white shadow-action hover:bg-accent-hover',
        primary: 'bg-accent text-white shadow-action hover:bg-accent-hover',
        secondary: 'border-line bg-surface text-ink shadow-control hover:bg-subtle',
        outline: 'border-line-strong bg-surface text-ink hover:bg-subtle',
        ghost: 'bg-transparent text-muted hover:bg-subtle hover:text-ink',
        destructive: 'bg-danger text-white hover:brightness-90',
        danger: 'bg-danger text-white hover:brightness-90',
        link: 'bg-transparent text-accent underline-offset-4 hover:text-accent-hover hover:underline',
      },
      size: {
        sm: 'min-h-8 px-3 py-1.5 text-caption',
        default: 'min-h-9 px-3.5 py-2 text-ui',
        md: 'min-h-9 px-3.5 py-2 text-ui',
        lg: 'min-h-11 px-5 py-2.5 text-body',
        icon: 'size-8 p-0 [&_svg]:size-4',
        'icon-sm': 'size-7 p-0 [&_svg]:size-3.5',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : 'button'}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {loading && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
