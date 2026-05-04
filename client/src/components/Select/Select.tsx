import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { useId } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  /** Width override for the trigger; defaults to 100% of parent. */
  width?: number | string;
  ariaLabel?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select...',
  label,
  hint,
  error,
  disabled,
  width,
  ariaLabel,
}: SelectProps) {
  const generatedId = useId();
  const triggerId = generatedId;
  const hintId = hint ? `${triggerId}-hint` : undefined;
  const errorId = error ? `${triggerId}-error` : undefined;

  const triggerStyle = width != null ? { width } : undefined;

  const trigger = (
    <RadixSelect.Trigger
      id={triggerId}
      className={`field-select-trigger${error ? ' field-control-error' : ''}`}
      style={triggerStyle}
      aria-label={ariaLabel ?? label ?? placeholder}
      aria-invalid={!!error || undefined}
      aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
    >
      <RadixSelect.Value placeholder={placeholder} />
      <RadixSelect.Icon className="field-select-icon">
        <ChevronDown size={14} aria-hidden />
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
  );

  const root = (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      {trigger}
      <RadixSelect.Portal>
        <RadixSelect.Content
          className="field-select-content"
          position="popper"
          sideOffset={4}
        >
          <RadixSelect.Viewport>
            {options.map(opt => (
              <RadixSelect.Item
                key={opt.value}
                value={opt.value}
                className="field-select-item"
              >
                <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="field-select-item-indicator">
                  <Check size={14} aria-hidden />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );

  if (!label && !hint && !error) {
    return root;
  }

  return (
    <div className="field">
      {label && (
        <label htmlFor={triggerId} className="field-label">
          {label}
        </label>
      )}
      {root}
      {error ? (
        <span id={errorId} className="field-error">{error}</span>
      ) : hint ? (
        <span id={hintId} className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
