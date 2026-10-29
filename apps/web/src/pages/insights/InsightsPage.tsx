import { formatCurrency, INSIGHT_TIPS, type ProjectDocument, topOverrunTasks } from '@evm/core';
import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { NoProjectState } from '../../components/NoProjectState';
import { healthBadge, INSIGHT_GROUPS } from '../../components/statusLabels';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cx } from '../../components/ui/cx';
import { PageHeader } from '../../components/ui/PageHeader';
import { toneIcon } from '../../components/ui/tones';
import { useAnalysis } from '../../lib/analysis';
import type { Navigate } from '../../state/navigation';
import { useProjects } from '../../state/ProjectStore';
import { AiSummaryPanel } from './AiSummaryPanel';
import { UnusualExpenses } from './UnusualExpenses';

const TONE_TEXT = {
  error: 'text-error-strong bg-error-soft',
  warning: 'text-warning-strong bg-warning-soft',
  info: 'text-text bg-card-subtle',
  success: 'text-success-strong bg-success-soft',
  neutral: 'text-muted bg-card-subtle',
} as const;

export function InsightsPage({ onNavigate }: { onNavigate: Navigate }) {
  const { current } = useProjects();
  if (!current) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Insights" />
        <NoProjectState onNavigate={onNavigate} what="insights" />
      </div>
    );
  }
  // Keyed so switching project resets (and cancels) the AI summary request.
  return <Insights key={current.project.id} document={current} onNavigate={onNavigate} />;
}

function Insights({ document, onNavigate }: { document: ProjectDocument; onNavigate: Navigate }) {
  const analysis = useAnalysis(document);
  const { insights, health, taskMetrics, metrics, anomalies } = analysis;
  const badge = healthBadge(health);
  const contributors = useMemo(() => topOverrunTasks(taskMetrics, 3), [taskMetrics]);
  const names = new Map(document.tasks.map((t) => [t.id, t.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Insights"
        description={`What the indicators say about ${document.project.name} as of ${document.project.statusDate}.`}
        actions={
          <span className="flex items-center gap-2 text-control text-muted">
            Overall health
            <Badge tone={badge.tone} className="px-3 py-1 text-control">
              {badge.label}
            </Badge>
          </span>
        }
      />

      {insights.length === 0 && (
        <Card>
          <p className="text-body text-muted">
            No insights yet. Add tasks with budgets, progress and actual costs to see how the
            project is doing.
          </p>
        </Card>
      )}

      {INSIGHT_GROUPS.map((group) => {
        const items = insights.filter((i) => i.status === group.status);
        if (items.length === 0) return null;
        const Icon = toneIcon(group.tone);
        return (
          <section key={group.status} aria-label={group.heading} className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 font-display text-section font-medium">
              {group.heading}
              <span className="font-mono text-control text-muted">({items.length})</span>
            </h2>
            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {items.map((insight) => (
                <li
                  key={insight.ruleId}
                  data-rule={insight.ruleId}
                  className="flex gap-4 rounded-xl border border-border bg-card p-6"
                >
                  <span
                    className={cx(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      TONE_TEXT[group.tone],
                    )}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span className="sr-only">{group.heading}</span>
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono text-support tracking-wider text-muted">
                      {insight.ruleId}
                    </p>
                    <p className="mt-1 text-body font-medium text-text">{insight.message}</p>
                    {INSIGHT_TIPS[insight.ruleId] && (
                      <p className="mt-2 text-control text-muted">
                        <span className="font-medium text-text">What to do: </span>
                        {INSIGHT_TIPS[insight.ruleId]}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <Card
        title="Top contributors to overrun"
        description="Tasks with the most negative cost variance (EV − AC) — IN-12."
      >
        {contributors.length === 0 ? (
          <p className="text-control text-muted">No task is over budget on earned value.</p>
        ) : (
          <ol
            className="flex flex-col divide-y divide-border"
            aria-label="Top contributors to overrun"
          >
            {contributors.map((m, index) => (
              <li
                key={m.taskId}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="flex items-center gap-3">
                  <span className="font-mono text-support text-muted">{index + 1}</span>
                  <span className="font-mono text-control">{m.taskId}</span>
                  <span className="text-body">{names.get(m.taskId)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-control text-error-strong tabular-nums">
                    {formatCurrency(m.cv, document.project.currency)}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={ArrowRight}
                    onClick={() => onNavigate('dashboard', { task: m.taskId })}
                  >
                    {`View task ${m.taskId}`}
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <UnusualExpenses anomalies={anomalies} onNavigate={onNavigate} />

      <AiSummaryPanel
        document={document}
        metrics={metrics}
        taskMetrics={taskMetrics}
        anomalies={anomalies}
      />
    </div>
  );
}
