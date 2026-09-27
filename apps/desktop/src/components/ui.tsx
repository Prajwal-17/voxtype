import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/utils';
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
          className={cn('shrink-0 text-current hover:bg-line', className)}
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
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-b-0 last:pb-0 max-lg:gap-4 max-md:flex-wrap">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-description`} className="mt-1 max-w-lg text-ui text-muted">
          {description}
        </p>
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
  description: string;
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

export function Logo({ className }: { className?: string }) {
  return (
    <div role="img" aria-label="VoxType" className={cn('flex items-center gap-2.5', className)}>
      <img src="/voxtype.svg" alt="" width={32} height={32} className="size-8 shrink-0" />
      <span
        aria-hidden="true"
        className="font-sans text-subheading font-semibold tracking-[-.03em] text-inverse max-lg:hidden"
      >
        VoxType
      </span>
    </div>
  );
}

export function Shortcut() {
  return <Kbd data-shortcut>Right Alt</Kbd>;
}
