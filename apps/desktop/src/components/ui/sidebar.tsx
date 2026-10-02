/* Adapted from shadcn/ui's MIT-licensed Sidebar (new-york).
 * Desktop composition only; see THIRD-PARTY-NOTICES.md.
 * Uses the app's existing tokens and 40px minimum control targets.
 */
/* eslint-disable react-refresh/only-export-components -- shadcn component/context module */
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../../lib/utils';
import { SidebarSimpleIcon } from '../icons';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

type SidebarContextValue = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  toggleSidebar: () => void;
};
const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used within SidebarProvider.');
  return context;
}

export function SidebarProvider({
  children,
  className,
  style,
  ...props
}: React.ComponentProps<'div'>) {
  const [open, setOpen] = React.useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const toggleSidebar = React.useCallback(() => setOpen((value) => !value), []);
  React.useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = (event: MediaQueryListEvent) => setOpen(event.matches);
    media.addEventListener('change', update);
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]'))
      )
        return;
      if (
        event.key.toLowerCase() === 'b' &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [toggleSidebar]);
  const state = open ? 'expanded' : 'collapsed';
  const value = React.useMemo<SidebarContextValue>(
    () => ({ state, open, toggleSidebar }),
    [state, open, toggleSidebar],
  );
  return (
    <SidebarContext.Provider value={value}>
      <div
        data-sidebar="wrapper"
        data-state={state}
        className={cn('group/sidebar-wrapper flex min-h-svh w-full', className)}
        style={
          {
            '--sidebar-width': '248px',
            '--sidebar-width-icon': '80px',
            ...style,
          } as React.CSSProperties
        }
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ className, children, ...props }: React.ComponentProps<'aside'>) {
  const { state } = useSidebar();
  return (
    <div
      className="group/sidebar peer shrink-0 text-inverse"
      data-state={state}
      data-collapsible={state === 'collapsed' ? 'icon' : ''}
    >
      <div className="w-[var(--sidebar-width)] group-data-[collapsible=icon]/sidebar:w-[var(--sidebar-width-icon)]" />
      <aside
        id="desktop-sidebar"
        data-sidebar="sidebar"
        aria-label="Workspace sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-[var(--sidebar-width)] flex-col border-r border-navigation-line bg-navigation group-data-[collapsible=icon]/sidebar:w-[var(--sidebar-width-icon)]',
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

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { open, toggleSidebar } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      static
      className={className}
      aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
      title={open ? 'Collapse sidebar' : 'Expand sidebar'}
      aria-expanded={open}
      aria-controls="desktop-sidebar"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) toggleSidebar();
      }}
      {...props}
    >
      <SidebarSimpleIcon size={20} aria-hidden="true" />
    </Button>
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
      className={cn(
        'mb-3 px-3 text-[10px] font-semibold tracking-[.16em] text-inverse-muted group-data-[collapsible=icon]/sidebar:hidden',
        className,
      )}
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
  React.ComponentProps<'button'> & { asChild?: boolean; isActive?: boolean; tooltip?: string }
>(({ asChild = false, isActive = false, tooltip, className, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  const { state } = useSidebar();
  const button = (
    <Comp
      ref={ref}
      type={asChild ? undefined : 'button'}
      data-sidebar="menu-button"
      data-active={isActive}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 overflow-hidden rounded-control px-3 py-2 text-left text-ui font-medium text-inverse-muted transition-[background-color,color] duration-150 hover:bg-navigation-hover hover:text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-navigation-raised data-[active=true]:text-inverse group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-0 [&>svg]:shrink-0 [&>span:last-child]:truncate motion-reduce:transition-none',
        className,
      )}
      {...props}
    />
  );
  if (!tooltip) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" align="center" hidden={state !== 'collapsed'}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
});
SidebarMenuButton.displayName = 'SidebarMenuButton';
