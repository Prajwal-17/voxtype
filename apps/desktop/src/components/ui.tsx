import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import * as Tooltip from '@radix-ui/react-tooltip';
import { X, LoaderCircle, AudioLines } from 'lucide-react';
import clsx from 'clsx';
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'border-line-strong bg-surface text-ink hover:bg-subtle',
  ghost: 'bg-transparent text-muted hover:bg-subtle hover:text-ink',
  danger: 'bg-danger text-white hover:brightness-90',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 py-1.5 text-caption',
  md: 'min-h-9 px-3.5 py-2 text-ui',
  lg: 'min-h-11 px-5 py-2.5 text-body',
};

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  loading,
  className,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control border border-transparent font-medium transition-[transform,background-color,color] duration-150 ease-out enabled:active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none motion-reduce:active:scale-100',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
    >
      {loading && <LoaderCircle size={15} className="animate-spin" />}
      {children}
    </button>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          {...props}
          aria-label={label}
          className={clsx(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-control border-0 bg-transparent text-current transition-[transform,background-color] duration-150 ease-out enabled:active:scale-[.97] enabled:hover:bg-line disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none motion-reduce:active:scale-100',
            props.className,
          )}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="z-50 rounded-control bg-graphite px-3 py-2 text-caption text-inverse [transform-origin:var(--radix-tooltip-content-transform-origin)] [&_svg]:fill-graphite"
          sideOffset={7}
        >
          {label}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
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
    <div className="flex items-center justify-between gap-6 border-b border-line py-4 last:border-b-0 last:pb-0 [&:has([role=switch])]:max-[700px]:flex-nowrap [&>div:first-child]:min-w-0 [&_label]:text-ui [&_label]:font-medium [&_p]:mt-1 [&_p]:max-w-lg [&_p]:text-ui [&_p]:text-muted max-[1050px]:gap-4 max-[700px]:flex-wrap">
      <div>
        <label htmlFor={id}>{label}</label>
        <p id={`${id}-description`}>{description}</p>
      </div>
      <Switch.Root
        id={id}
        aria-describedby={`${id}-description`}
        className="relative h-6 w-10 shrink-0 rounded-full border-0 bg-line-strong p-0.5 transition-colors duration-150 data-[state=checked]:bg-accent"
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      >
        <Switch.Thumb className="block size-5 rounded-full bg-surface transition-transform duration-150 data-[state=checked]:translate-x-4" />
      </Switch.Root>
    </div>
  );
}
export function Confirm({
  trigger,
  title,
  description,
  onConfirm,
  pending,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-graphite/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-40 w-[min(440px,calc(100vw-40px))] -translate-x-1/2 -translate-y-1/2 rounded-panel bg-surface p-7 shadow-dialog [&>p]:mt-4 [&>p]:text-body [&>p]:text-muted">
          <div className="flex items-center justify-between">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close">
                <X size={18} />
              </IconButton>
            </Dialog.Close>
          </div>
          <Dialog.Description>{description}</Dialog.Description>
          <div className="mt-7 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button>Keep history</Button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <Button variant="danger" onClick={onConfirm} loading={pending}>
                Delete history
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-[28px] font-semibold tracking-[-.04em]">
      <span className="grid size-8 place-items-center text-signal">
        <AudioLines size={23} strokeWidth={2.2} />
      </span>
      {!compact && <span>flow</span>}
    </div>
  );
}
export function Shortcut() {
  return (
    <span className="inline-flex items-center gap-1 align-middle" data-shortcut>
      <kbd className="inline-flex min-h-[23px] items-center justify-center rounded border border-line-strong bg-surface px-1.5 font-sans text-caption text-muted shadow-[0_1px_0_theme(colors.line)] group-[.sidebar]:border-graphite-line group-[.sidebar]:bg-graphite-raised group-[.sidebar]:text-inverse group-[.sidebar]:shadow-none">
        Right Alt
      </kbd>
    </span>
  );
}
