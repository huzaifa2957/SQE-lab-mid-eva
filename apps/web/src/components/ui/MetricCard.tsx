import type { ReactNode } from 'react';
import { cx } from './cx';

interface MetricCardProps {
  label: string;
  value: string;
  /** Tooltip, e.g. why the value is N/A (FR-13). */
  title?: string;
  footer?: ReactNode;
  className?: string;
}

export function MetricCard({ label, value, title, footer, className }: MetricCardProps) {
  return (
    <div
      className={cx('flex flex-col gap-2 rounded-xl border border-border bg-card p-6', className)}
    >
      <p className="font-mono text-support font-medium tracking-wider text-muted uppercase">
        {label}
      </p>
      <p className="font-display text-metric font-medium text-text tabular-nums" title={title}>
        {value}
      </p>
      {footer && <div className="text-support text-muted">{footer}</div>}
    </div>
  );
}
