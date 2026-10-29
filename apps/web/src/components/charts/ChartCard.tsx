import type { ReactNode } from 'react';
import { InfoTip } from '../ui/InfoTip';

interface ChartCardProps {
  title: string;
  description: string;
  /** "How to read this chart" tooltip content. */
  howToRead: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

/** Card for a chart: title, info tooltip, one-line description and a fixed-height plot area. */
export function ChartCard({ title, description, howToRead, actions, children }: ChartCardProps) {
  return (
    <section
      aria-label={title}
      className="flex flex-col rounded-xl border border-border bg-card p-6"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h2 className="font-display text-subsection font-medium text-text">{title}</h2>
            <InfoTip label={`How to read: ${title}`}>{howToRead}</InfoTip>
          </div>
          <p className="mt-1 text-control text-muted">{description}</p>
        </div>
        {actions}
      </header>
      <div className="relative h-72">{children}</div>
    </section>
  );
}

/** Placeholder inside a chart area (e.g. not enough data). */
export function ChartMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border-strong px-6 text-center text-control text-muted">
      {children}
    </div>
  );
}
