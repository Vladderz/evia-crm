import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, id, className = '', ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
          {required && <span className="field-required" aria-hidden>*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy}
        className={`field-control${error ? ' field-control-error' : ''}${className ? ' ' + className : ''}`}
        {...rest}
      />
      {error ? (
        <span id={errorId} className="field-error">{error}</span>
      ) : hint ? (
        <span id={hintId} className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
});
