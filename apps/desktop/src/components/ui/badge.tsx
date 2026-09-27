/* eslint-disable react-refresh/only-export-components -- standard CN pattern: variants + component */
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-control border px-2.5 py-1 text-caption font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent-soft text-accent-ink',
        secondary: 'border-line bg-surface text-muted',
        success: 'border-transparent bg-success-soft text-success',
        destructive: 'border-transparent bg-danger-soft text-danger',
        warning: 'border-transparent bg-warning-soft text-warning',
        outline: 'border-line-strong bg-transparent text-ink',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
