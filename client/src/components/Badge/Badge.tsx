import type { ReactNode } from 'react';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'brand'
  | 'neutral';

export type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
}

export function Badge({ variant, size = 'sm', children }: BadgeProps) {
  return (
    <span className={`badge-v1 badge-v1-${size} badge-v1-${variant}`}>
      {children}
    </span>
  );
}
