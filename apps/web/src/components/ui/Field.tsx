import { CircleAlert } from 'lucide-react';
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useId,
} from 'react';
import { cx } from './cx';

interface FieldProps {
  label: string;
  /** Visually hide the label (it stays available to screen readers), e.g. in table cells. */
  hideLabel?: boolean;
  error?: string;
  hint?: ReactNode;
}

const CONTROL =
  'h-10 w-full rounded-lg border bg-card px-3 text-control text-text placeholder:text-muted disabled:opacity-60';

function FieldShell({
  id,
  label,
  hideLabel,
  error,
  hint,
  children,
  className,
}: FieldProps & { id: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className={cx('text-control font-medium text-text', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1 text-support text-error-strong">
          <CircleAlert size={14} aria-hidden="true" className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-support text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: ReactNode): string | undefined {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {
  fieldClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hideLabel, error, hint, id, className, fieldClassName, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell
      id={inputId}
      label={label}
      hideLabel={hideLabel}
      error={error}
      hint={hint}
      className={fieldClassName}
    >
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        className={cx(CONTROL, error ? 'border-error' : 'border-border-strong', className)}
        {...rest}
      />
    </FieldShell>
  );
});

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldProps {
  options: readonly SelectOption[];
  fieldClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hideLabel, error, hint, id, options, className, fieldClassName, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <FieldShell
      id={selectId}
      label={label}
      hideLabel={hideLabel}
      error={error}
      hint={hint}
      className={fieldClassName}
    >
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(selectId, error, hint)}
        className={cx(CONTROL, 'pr-8', error ? 'border-error' : 'border-border-strong', className)}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
});
