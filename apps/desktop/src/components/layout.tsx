import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

// Sidebar nav item — replaces the old
// aria-[current=page]:... hover:not-aria-[current=page]:... [&>svg]:... [&>span]:hidden soup
// with a clean `active` variant.
const sidebarNavItemVariants = cva(
  'flex h-10 w-full items-center gap-3 rounded-control border-0 bg-transparent px-3 text-left text-ui font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-lg:justify-center max-lg:px-0',
  {
    variants: {
      active: {
        true: 'bg-navigation-raised text-inverse',
        false: 'text-inverse-muted hover:bg-navigation-raised hover:text-inverse',
      },
    },
    defaultVariants: { active: false },
  },
);

export function SidebarNavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          onClick={onClick}
          className={cn(sidebarNavItemVariants({ active }))}
        >
          <Icon size={17} strokeWidth={1.8} className={cn(active && 'text-white')} />
          <span className="max-lg:hidden">{label}</span>
          {active && <span className="ml-auto size-1 rounded-full bg-accent max-lg:hidden" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="hidden max-lg:block">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// Page header — replaces [&_h1]: / [&_p]: selector soup with explicit elements.
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex items-end justify-between gap-5 max-md:flex-wrap max-md:items-start max-md:gap-3">
      <div>
        <h1 className="text-heading font-semibold tracking-[-.025em] text-balance max-md:text-[25px]">
          {title}
        </h1>
        <p className="mt-1.5 text-body text-muted">{description}</p>
      </div>
      {actions}
    </div>
  );
}

// Section header — replaces [&_h2]: / [&_p]: soup.
export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-title font-semibold tracking-[-.015em]">{title}</h2>
      <p className="mt-1 text-ui text-muted">{description}</p>
    </div>
  );
}

// Status dot — replaces data-[live=true]:bg-accent arbitrary + repeated span classes.
export function StatusDot({ live, className }: { live?: boolean; className?: string }) {
  return (
    <span
      data-status-dot
      data-live={live}
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full bg-faint data-[live=true]:bg-accent',
        className,
      )}
    />
  );
}

// Field row — replaces the repeated flex/border/[&>div:first-child] soup in Settings.
export function FieldRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: React.ReactNode;
  description: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-8 border-b border-line py-4 last:border-b-0 last:pb-0 max-md:flex-wrap max-md:gap-3">
      <div className="min-w-0">
        {typeof label === 'string' ? (
          <label htmlFor={htmlFor} className="text-ui font-medium text-ink">
            {label}
          </label>
        ) : (
          label
        )}
        <p className="mt-1 max-w-lg text-ui text-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

export type SidebarNavItemVariants = VariantProps<typeof sidebarNavItemVariants>;
