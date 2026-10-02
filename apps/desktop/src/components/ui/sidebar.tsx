/* Adapted from shadcn/ui's MIT-licensed Sidebar (new-york).
 * Desktop composition only; see THIRD-PARTY-NOTICES.md.
 * Uses the app's existing tokens and 40px minimum control targets.
 */
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../../lib/utils';

export function SidebarProvider({ className, style, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex min-h-svh w-full bg-canvas text-ink', className)}
      style={{ '--sidebar-width': '228px', ...style } as React.CSSProperties}
      {...props}
    />
  );
}

export function Sidebar({ className, children, ...props }: React.ComponentProps<'aside'>) {
  return (
    <div className="group/sidebar peer shrink-0 text-ink">
      <div className="w-[var(--sidebar-width)]" />
      <aside
        id="desktop-sidebar"
        data-sidebar="sidebar"
        aria-label="Workspace sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-[var(--sidebar-width)] flex-col border-r border-navigation-line bg-navigation ',
          className,
        )}
        {...props}
      >
        {children}
      </aside>
    </div>
  );
}

export function SidebarInset({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      data-sidebar="inset"
      className={cn('relative min-w-0 flex-1 bg-canvas', className)}
      {...props}
    />
  );
}

export function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-sidebar="header"
      className={cn('flex shrink-0 flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}
export function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-sidebar="content"
      className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-4 py-3', className)}
      {...props}
    />
  );
}
export function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-sidebar="footer"
      className={cn('flex shrink-0 flex-col gap-3 p-4', className)}
      {...props}
    />
  );
}
export function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-sidebar="group"
      className={cn('relative flex w-full min-w-0 flex-col', className)}
      {...props}
    />
  );
}
export function SidebarGroupLabel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-sidebar="group-label"
      className={cn('mb-3 px-3 text-[10px] font-semibold tracking-[.16em] text-muted ', className)}
      {...props}
    />
  );
}
export function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-sidebar="menu"
      className={cn('flex w-full min-w-0 flex-col gap-1.5', className)}
      {...props}
    />
  );
}
export function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li data-sidebar="menu-item" className={cn('group/menu-item relative', className)} {...props} />
  );
}

export const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> & { asChild?: boolean; isActive?: boolean }
>(({ asChild = false, isActive = false, className, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  const button = (
    <Comp
      ref={ref}
      type={asChild ? undefined : 'button'}
      data-sidebar="menu-button"
      data-active={isActive}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 overflow-hidden rounded-control px-3 py-2 text-left text-ui font-medium text-muted transition-[background-color,color] duration-150 hover:bg-accent-soft hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-accent data-[active=true]:text-inverse data-[active=true]:hover:bg-accent-hover data-[active=true]:hover:text-inverse [&>svg]:shrink-0 [&>span:last-child]:truncate motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  );
  return button;
});
SidebarMenuButton.displayName = 'SidebarMenuButton';
