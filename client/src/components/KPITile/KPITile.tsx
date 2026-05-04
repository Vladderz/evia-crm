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
}: KPITileProps) {
  const clickable = !!onClick;
  const Tag: 'button' | 'div' = clickable ? 'button' : 'div';

  return (
    <Tag
      className={`kpi-tile${clickable ? ' kpi-tile-clickable' : ''}`}
      onClick={onClick}
      type={clickable ? 'button' : undefined}
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
      </div>
    </Tag>
  );
}
