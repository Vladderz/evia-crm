import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type KPITileTone =
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

interface KPITileProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: KPITileTone;
  /** Render the value in JetBrains Mono - use for currency, large numbers. */
  mono?: boolean;
  loading?: boolean;
  onClick?: () => void;
  /** Overrides the default label-derived accessible name (e.g. for a cycling tile). */
  ariaLabel?: string;
  /** Rendered at the base of the content column - used for cycle indicators etc. */
  footer?: ReactNode;
}

export function KPITile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
  mono = false,
  loading = false,
  onClick,
  ariaLabel,
  footer,
}: KPITileProps) {
  const clickable = !!onClick;
  const Tag: 'button' | 'div' = clickable ? 'button' : 'div';

  return (
    <Tag
      className={`kpi-tile${clickable ? ' kpi-tile-clickable' : ''}`}
      onClick={onClick}
      type={clickable ? 'button' : undefined}
      aria-label={ariaLabel}
      style={clickable ? { textAlign: 'left', font: 'inherit', border: '1px solid var(--border-subtle)' } : undefined}
    >
      <span className={`kpi-tile-icon kpi-tile-icon-${tone}`}>
        <Icon size={20} aria-hidden />
      </span>
      <div className="kpi-tile-content">
        <p className="kpi-tile-label">{label}</p>
        {loading ? (
          <span className="kpi-tile-skeleton" aria-hidden />
        ) : (
          <div className={`kpi-tile-value${mono ? ' kpi-tile-value-mono' : ''}`}>
            {value}
          </div>
        )}
        {hint && !loading && <div className="kpi-tile-hint">{hint}</div>}
        {footer && <div className="kpi-tile-footer">{footer}</div>}
      </div>
    </Tag>
  );
}
