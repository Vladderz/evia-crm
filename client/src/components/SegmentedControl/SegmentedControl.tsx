import { useCallback, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface SegmentedControlOption<V extends string> {
  value: V;
  label: ReactNode;
  count?: number;
}

interface SegmentedControlProps<V extends string> {
  options: SegmentedControlOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Required so the radiogroup has an accessible name. */
  ariaLabel: string;
  /** Segments share the width equally when true. */
  fullWidth?: boolean;
}

export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  fullWidth = false,
}: SegmentedControlProps<V>) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const selectAt = useCallback(
    (index: number) => {
      const clamped = ((index % options.length) + options.length) % options.length;
      const next = options[clamped];
      if (!next) return;
      onChange(next.value);
      const btn = buttonsRef.current[clamped];
      btn?.focus();
    },
    [onChange, options],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          selectAt(index + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          selectAt(index - 1);
          break;
        case 'Home':
          e.preventDefault();
          selectAt(0);
          break;
        case 'End':
          e.preventDefault();
          selectAt(options.length - 1);
          break;
        default:
      }
    },
    [options.length, selectAt],
  );

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`segmented-control${fullWidth ? ' segmented-control-full' : ''}`}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={el => { buttonsRef.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={`segmented-control-segment${selected ? ' segmented-control-segment-selected' : ''}`}
            onClick={() => onChange(opt.value)}
            onKeyDown={e => handleKeyDown(e, i)}
          >
            <span className="segmented-control-label">{opt.label}</span>
            {opt.count !== undefined && (
              <span className="stage-tab-count">{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
