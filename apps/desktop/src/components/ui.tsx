import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/utils';
import { appName, isDevelopment, shortcutLabel } from '../lib/environment';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';
import { Button, type ButtonProps } from './ui/button';
import { Kbd } from './ui/kbd';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

// CN barrel: canonical Button lives in ./ui/button. Legacy variant/size aliases
// (primary/danger, md) are supported there so existing call sites keep working.
export { Button };
export type { ButtonProps };

export function IconButton({
  label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className={cn('shrink-0 text-current', className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-b-0 last:pb-0 max-lg:gap-4 max-md:flex-wrap">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        {description && (
          <p id={`${id}-description`} className="mt-1 max-w-lg text-ui text-muted">
            {description}
          </p>
        )}
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-description`}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

export function Confirm({
  trigger,
  title,
  description,
  onConfirm,
  pending,
  cancelLabel = 'Keep history',
  confirmLabel = 'Delete history',
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  onConfirm: () => void;
  pending?: boolean;
  cancelLabel?: string;
  confirmLabel?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="destructive" onClick={onConfirm} loading={pending}>
              {confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Logo({
  className,
  tone = 'inverse',
  collapse = true,
}: {
  className?: string;
  tone?: 'inverse' | 'ink';
  collapse?: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={appName}
      className={cn('relative flex items-center gap-2.5', className)}
    >
      <img src="/voxtype.svg" alt="" width={32} height={32} className="size-8 shrink-0" />
      <span
        aria-hidden="true"
        className={cn(
          'font-sans text-subheading font-semibold tracking-[-.03em]',
          tone === 'inverse' ? 'text-inverse' : 'text-ink',
          collapse && 'max-lg:hidden',
        )}
      >
        VoxType
      </span>
      {isDevelopment && (
        <span
          aria-hidden="true"
          className={cn(
            'rounded-menu-item bg-warning-soft px-1.5 py-0.5 text-[0.625rem] font-semibold leading-none tracking-[.04em] text-warning',
            collapse &&
              'max-lg:absolute max-lg:-right-2 max-lg:-bottom-1 max-lg:border max-lg:border-navigation',
          )}
        >
          DEV
        </span>
      )}
    </div>
  );
}

export function Shortcut({ label = shortcutLabel }: { label?: string }) {
  return <Kbd data-shortcut>{label}</Kbd>;
}
