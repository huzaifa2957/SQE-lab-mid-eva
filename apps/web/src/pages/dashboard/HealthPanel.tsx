import { formatPercent, type HealthStatus, type Insight, type ProjectMetrics } from '@evm/core';
import { healthBadge } from '../../components/statusLabels';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/ProgressBar';

interface HealthPanelProps {
  health: HealthStatus | null;
  headline: Insight | null;
  metrics: ProjectMetrics;
}

/** Row 1: overall health (FR-27), % complete vs % spent, and the headline insight. */
export function HealthPanel({ health, headline, metrics }: HealthPanelProps) {
  const badge = healthBadge(health);
  return (
    <section
      aria-label="Project health"
      className="grid grid-cols-1 gap-8 rounded-xl bg-feature p-8 text-feature-text lg:grid-cols-[1.2fr_1fr]"
    >
      <div className="flex flex-col gap-3">
        <p className="font-mono text-support font-medium tracking-wider text-feature-muted uppercase">
          Project health
        </p>
        <div>
          <Badge tone={badge.tone} className="px-3 py-1 text-control">
            {badge.label}
          </Badge>
        </div>
        <p className="font-display text-section font-medium" data-testid="headline">
          {headline ? headline.message : 'Add tasks and progress to see how the project is doing.'}
        </p>
      </div>
      <div className="flex flex-col justify-center gap-5">
        <ProgressBar
          onFeature
          label="Work complete"
          value={metrics.percentComplete}
          display={formatPercent(metrics.percentComplete)}
          tone="accent"
        />
        <ProgressBar
          onFeature
          label="Budget spent"
          value={metrics.percentSpent}
          display={formatPercent(metrics.percentSpent)}
          tone="muted"
        />
        <p className="text-support text-feature-muted">
          Spending ahead of progress means each unit of work is costing more than planned.
        </p>
      </div>
    </section>
  );
}
