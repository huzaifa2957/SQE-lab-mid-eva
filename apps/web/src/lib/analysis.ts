// Everything the Dashboard and Insights pages show, computed by @evm/core and memoised so
// 1,000 tasks stay smooth (NF-01). Each step only re-runs when its own inputs change (FR-24).

import {
  type Anomaly,
  type CategoryVariance,
  computeMetricsFromTotals,
  computeTaskMetrics,
  detectAnomalies,
  generateInsights,
  groupAnomaliesByTask,
  type HealthStatus,
  headlineInsight,
  type Insight,
  type KpiId,
  kpiStatuses,
  overallHealth,
  previousSnapshot,
  type ProjectDocument,
  type ProjectMetrics,
  snapshotMetrics,
  sortInsights,
  type StatusSnapshot,
  sumTaskMetrics,
  type TaskMetrics,
  varianceByCategory,
} from '@evm/core';
import { useMemo } from 'react';

export interface ProjectAnalysis {
  taskMetrics: TaskMetrics[];
  metrics: ProjectMetrics;
  insights: Insight[];
  headline: Insight | null;
  health: HealthStatus | null;
  statuses: Record<KpiId, HealthStatus | null>;
  previous: { snapshot: StatusSnapshot; metrics: ProjectMetrics } | null;
  categories: CategoryVariance[];
  anomalies: Anomaly[];
  anomaliesByTask: Map<string, Anomaly[]>;
}

/** FR-30: unusual expenses (AN-01…AN-06), and the task-level ones keyed by task ID. */
export function useAnomalies(
  document: ProjectDocument,
): Pick<ProjectAnalysis, 'anomalies' | 'anomaliesByTask'> {
  const { tasks, snapshots } = document;
  const { currency } = document.project;
  return useMemo(() => {
    const anomalies = detectAnomalies({ tasks, snapshots, currency });
    return { anomalies, anomaliesByTask: groupAnomaliesByTask(anomalies) };
  }, [tasks, snapshots, currency]);
}

export function useAnalysis(document: ProjectDocument): ProjectAnalysis {
  const { tasks, snapshots, eacMethod } = document;
  const { statusDate, currency } = document.project;

  const taskMetrics = useMemo(
    () => tasks.map((task) => computeTaskMetrics(task, statusDate)),
    [tasks, statusDate],
  );
  const metrics = useMemo(
    () => computeMetricsFromTotals(sumTaskMetrics(tasks, taskMetrics), eacMethod),
    [tasks, taskMetrics, eacMethod],
  );
  const insights = useMemo(
    () => sortInsights(generateInsights({ metrics, taskMetrics, tasks, snapshots, currency })),
    [metrics, taskMetrics, tasks, snapshots, currency],
  );
  const previous = useMemo(() => {
    const snapshot = previousSnapshot(snapshots, statusDate);
    return snapshot
      ? { snapshot, metrics: snapshotMetrics(snapshot, metrics.bac, eacMethod) }
      : null;
  }, [snapshots, statusDate, metrics.bac, eacMethod]);
  const categories = useMemo(() => varianceByCategory(tasks, taskMetrics), [tasks, taskMetrics]);
  const { anomalies, anomaliesByTask } = useAnomalies(document);

  return useMemo(
    () => ({
      taskMetrics,
      metrics,
      insights,
      headline: headlineInsight(insights),
      health: overallHealth(insights),
      statuses: kpiStatuses(metrics),
      previous,
      categories,
      anomalies,
      anomaliesByTask,
    }),
    [taskMetrics, metrics, insights, previous, categories, anomalies, anomaliesByTask],
  );
}
