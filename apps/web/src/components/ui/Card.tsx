import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Remove the inner padding (e.g. for edge-to-edge tables). */
  flush?: boolean;
}

export function Card({
  title,
  description,
  actions,
  flush,
  className,
  children,
  ...rest
}: CardProps) {
  const hasHeader = title || description || actions;
  return (
    <section
      className={cx('rounded-xl border border-border bg-card', !flush && 'p-6', className)}
      {...rest}
    >
      {hasHeader && (
        <header
          className={cx(
            'flex flex-wrap items-start justify-between gap-4',
            flush ? 'p-6 pb-4' : 'mb-4',
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-subsection font-medium text-text">{title}</h2>
            )}
            {description && <p className="mt-1 text-control text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

interface FeaturePanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  eyebrow?: string;
  title: ReactNode;
  actions?: ReactNode;
}

/** Forest-green panel for empty states and highlights. */
export function FeaturePanel({
  eyebrow,
  title,
  actions,
  className,
  children,
  ...rest
}: FeaturePanelProps) {
  return (
    <section className={cx('rounded-xl bg-feature p-8 text-feature-text', className)} {...rest}>
      {eyebrow && (
        <p className="font-mono text-support font-medium tracking-wider text-feature-muted uppercase">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 font-display text-section font-medium">{title}</h2>
      {children && <div className="mt-3 max-w-2xl text-body text-feature-muted">{children}</div>}
      {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
    </section>
  );
}
