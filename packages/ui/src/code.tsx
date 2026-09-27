import type { HTMLAttributes, ReactNode } from 'react';

export interface CodeProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export function Code({ children, ...props }: CodeProps) {
  return <code {...props}>{children}</code>;
}
