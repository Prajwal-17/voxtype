import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import * as Tooltip from '@radix-ui/react-tooltip';
import { X, LoaderCircle, AudioLines } from 'lucide-react';
import clsx from 'clsx';
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { buttonRecipe, type ButtonSize, type ButtonVariant } from '../design-system/recipes';
import { ui } from '../design-system/classes';

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
      className={buttonRecipe(variant, size, className)}
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
          className={clsx(ui.iconButton, props.className)}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className={ui.tooltip} sideOffset={7}>
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
    <div className={clsx(ui.settingRow, '[&:has([role=switch])]:max-[700px]:flex-nowrap')}>
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
        <Dialog.Overlay className={ui.dialogBackdrop} />
        <Dialog.Content className={ui.dialogContent}>
          <div className="flex items-center justify-between">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close">
                <X size={18} />
              </IconButton>
            </Dialog.Close>
          </div>
          <Dialog.Description>{description}</Dialog.Description>
          <div className={ui.dialogActions}>
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
    <span className={ui.shortcut} data-shortcut>
      <kbd className="inline-flex min-h-[23px] items-center justify-center rounded border border-line-strong bg-surface px-1.5 font-sans text-caption text-muted shadow-[0_1px_0_theme(colors.line)] group-[.sidebar]:border-graphite-line group-[.sidebar]:bg-graphite-raised group-[.sidebar]:text-inverse group-[.sidebar]:shadow-none">
        Right Alt
      </kbd>
    </span>
  );
}
