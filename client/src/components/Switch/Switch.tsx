import { useId, type ReactNode } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  hint?: ReactNode;
  /** Accessible label when no visible label is provided. */
  ariaLabel?: string;
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
  hint,
  ariaLabel,
}: SwitchProps) {
  const labelId = useId();
  const hintId = useId();

  const track = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={label ? labelId : undefined}
      aria-label={!label ? ariaLabel : undefined}
      aria-describedby={hint ? hintId : undefined}
      data-checked={checked}
      disabled={disabled}
      className="switch-track"
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="switch-thumb" aria-hidden />
    </button>
  );

  if (!label && !hint) return track;

  return (
    <div className={`switch-row${disabled ? ' switch-disabled' : ''}`}>
      {track}
      <div className="switch-text">
        {label && <span id={labelId} className="switch-label">{label}</span>}
        {hint && <span id={hintId} className="switch-hint">{hint}</span>}
      </div>
    </div>
  );
}
