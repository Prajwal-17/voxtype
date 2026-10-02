import * as React from 'react';
import { cn } from '../lib/utils';

// Page header — replaces [&_h1]: / [&_p]: selector soup with explicit elements.
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="mb-7 flex items-end justify-between gap-5 max-md:flex-wrap max-md:items-start max-md:gap-3">
      <div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-heading font-semibold tracking-[-.02em] text-balance outline-none"
        >
          {title}
        </h1>
        {description && <p className="mt-1.5 text-body text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

// Section header — replaces [&_h2]: / [&_p]: soup.
export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-title font-semibold tracking-[-.015em]">{title}</h2>
      {description && <p className="mt-1 text-ui text-muted">{description}</p>}
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
  description?: string;
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
        {description && <p className="mt-1 max-w-lg text-ui text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}
