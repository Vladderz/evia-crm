import { Loader2, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  children: ReactNode;
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 12, md: 14, lg: 16 };

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const iconSize = ICON_SIZE[size];
  const showSpinner = loading;
  const showIcon = Icon && !loading;

  const classes = [
    'btn-v1',
    `btn-v1-${variant}`,
    `btn-v1-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={classes}
      {...rest}
    >
      {showSpinner && (
        <Loader2 size={iconSize} className="btn-v1-spinner" aria-hidden />
      )}
      {showIcon && iconPosition === 'left' && <Icon size={iconSize} aria-hidden />}
      <span>{children}</span>
      {showIcon && iconPosition === 'right' && <Icon size={iconSize} aria-hidden />}
    </button>
  );
}
