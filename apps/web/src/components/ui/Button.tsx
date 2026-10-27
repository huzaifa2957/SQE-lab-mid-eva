import type { LucideIcon } from 'lucide-react';
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  icon?: LucideIcon;
  /** Icon-only button: the label is used as aria-label and tooltip. */
  iconOnly?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-text hover:bg-accent-hover',
  secondary: 'border border-border-strong bg-transparent text-text hover:bg-card-subtle',
  ghost: 'bg-transparent text-muted hover:bg-card-subtle hover:text-text',
  danger: 'border border-error bg-transparent text-error-strong hover:bg-error-soft',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconOnly, className, children, type, ...rest },
  ref,
) {
  const label = iconOnly && typeof children === 'string' ? children : undefined;
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium text-control whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'h-10 px-4' : 'h-8 px-3',
        iconOnly && (size === 'md' ? 'w-10 px-0' : 'w-8 px-0'),
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {!iconOnly && children}
    </button>
  );
});
