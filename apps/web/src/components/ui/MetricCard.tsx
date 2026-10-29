import { NOT_AVAILABLE } from '@evm/core';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { InfoTip } from './InfoTip';

interface MetricCardProps {
  label: string;
  value: string;
  /** FR-13: why the value is N/A — shown in a keyboard-reachable tooltip. */
  naReason?: string;
  /** Status badge (icon + text). */
  badge?: ReactNode;
  /** Change since the previous snapshot. */
  trend?: ReactNode;
  footer?: ReactNode;
  /** Extra controls (e.g. the EAC method selector). */
  children?: ReactNode;
  className?: string;
}

export function MetricCard({
  label,
  value,
  naReason,
  badge,
  trend,
  footer,
  children,
  className,
}: MetricCardProps) {
  const isNa = value === NOT_AVAILABLE;
  return (
    <div
      role="group"
      aria-label={label}
      className={cx('flex flex-col gap-2 rounded-xl border border-border bg-card p-6', className)}
    >
      <p className="font-mono text-support font-medium tracking-wider text-muted uppercase">
        {label}
      </p>
      <div className="flex items-center gap-1">
        <p
          className="font-display text-metric font-medium text-text tabular-nums"
          data-testid="metric-value"
        >
          {value}
        </p>
        {isNa && naReason && <InfoTip label={`Why is ${label} not available?`}>{naReason}</InfoTip>}
      </div>
      {(badge || trend) && (
        <div className="flex flex-wrap items-center gap-2">
          {badge}
          {trend}
        </div>
      )}
      {children}
      {footer && <div className="text-support text-muted">{footer}</div>}
    </div>
  );
}
