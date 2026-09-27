import type { AnchorHTMLAttributes, ReactNode } from 'react';

export interface CardProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  title: string;
  children: ReactNode;
}

export function Card({ title, children, ...props }: CardProps) {
  return (
    <a {...props}>
      <h2>{title}</h2>
      <p>{children}</p>
    </a>
  );
}
