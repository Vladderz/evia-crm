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
  /** Render a leading coloured dot - use on stage-style status chips,
      not on result badges (Won / Lost). */
  withDot?: boolean;
  children: ReactNode;
}

export function Badge({ variant, size = 'sm', withDot = false, children }: BadgeProps) {
  const classes = [
    'badge-v1',
    `badge-v1-${size}`,
    `badge-v1-${variant}`,
    withDot ? 'badge-v1-with-dot' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={classes}>{children}</span>;
}
