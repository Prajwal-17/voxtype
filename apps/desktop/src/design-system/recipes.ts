import clsx from 'clsx';

/** Typed component recipes composed entirely from Tailwind utilities. */
const buttonVariants = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'bg-surface text-ink border-line-strong hover:bg-subtle',
  ghost: 'bg-transparent text-muted hover:bg-subtle hover:text-ink',
  danger: 'bg-danger text-white hover:brightness-90',
} as const;
const buttonSizes = {
  sm: 'min-h-8 px-3 py-1.5 text-caption',
  md: 'min-h-9 px-3.5 py-2 text-ui',
  lg: 'min-h-11 px-5 py-2.5 text-body',
} as const;
export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;
export function buttonRecipe(variant: ButtonVariant, size: ButtonSize, className?: string) {
  return clsx(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control border border-transparent font-medium transition-[transform,background-color,color] duration-150 ease-out enabled:active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none motion-reduce:active:scale-100',
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}
