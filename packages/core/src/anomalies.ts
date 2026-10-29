// Unusual expense detection AN-01…AN-06 (PROJECT_PLAN FR-30). Deterministic and offline.

import { costVariance, costVariancePercent, earnedValue } from './evm';
import { formatCurrency, formatNumber, formatPercent } from './format';
import type { MetricValue, StatusSnapshot, Task } from './types';

export type AnomalySeverity = 'low' | 'medium' | 'high';

export interface Anomaly {
  ruleId: string;
  severity: AnomalySeverity;
  /** Set for task-level anomalies (AN-01, AN-02, AN-03, AN-05, AN-06). */
  taskId?: string;
  /** Set for snapshot-level anomalies (AN-04, AN-05): the later snapshot's date. */
  snapshotDate?: string;
  message: string;
}

export interface AnomalyThresholds {
  /** AN-01: |z| above this is an outlier. */
  zScore: number;
  /** AN-01: use the z-score rule from this many tasks; IQR rule below it. */
  minTasksForZScore: number;
  /** AN-01: the IQR rule needs at least this many tasks. */
  minTasksForIqr: number;
  /** AN-01: values beyond Q1 − k·IQR or Q3 + k·IQR are outliers. */
  iqrMultiplier: number;
  /** AN-04: a period AC increase above this × the median increase is a spike. */
  spikeMultiplier: number;
  /** AN-04: minimum number of period increases needed for a meaningful median. */
  minPeriodsForSpike: number;
  /** AN-06: complete tasks that spent less than this share of budget are flagged. */
  lowSpendRatio: number;
}

export const DEFAULT_ANOMALY_THRESHOLDS: Readonly<AnomalyThresholds> = Object.freeze({
  zScore: 2,
  minTasksForZScore: 5,
  minTasksForIqr: 3,
  iqrMultiplier: 1.5,
  spikeMultiplier: 2,
  minPeriodsForSpike: 3,
  lowSpendRatio: 0.5,
});

export interface AnomalyInput {
  tasks: readonly Task[];
  snapshots?: readonly StatusSnapshot[];
  currency?: string;
  thresholds?: Partial<AnomalyThresholds>;
}

function money(value: number, currency: string | undefined): string {
  return currency ? formatCurrency(value, currency) : formatNumber(value);
}

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

export function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Population standard deviation — the tasks are the whole population, not a sample. */
export function standardDeviation(values: readonly number[]): number {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/** Quantile with linear interpolation between closest ranks (same as Excel QUARTILE.INC). */
export function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

function byDate(snapshots: readonly StatusSnapshot[]): StatusSnapshot[] {
  return [...snapshots].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Task CV% = CV / EV × 100 — the cost efficiency of the work actually done. */
function taskCostVariancePercent(task: Task): MetricValue {
  const ev = earnedValue(task.budget, task.percentComplete);
  return costVariancePercent(costVariance(ev, task.actualCost), ev);
}

/**
 * AN-01: tasks whose CV% is an outlier. Uses |z| > 2 with 5+ tasks, otherwise the IQR
 * rule. Tasks with EV = 0 have no CV% and are skipped.
 */
export function detectCostVarianceOutliers(
  tasks: readonly Task[],
  thresholds: AnomalyThresholds = DEFAULT_ANOMALY_THRESHOLDS,
): Anomaly[] {
  const points = tasks.flatMap((task) => {
    const value = taskCostVariancePercent(task);
    return value === null ? [] : [{ task, value }];
  });
  const values = points.map((p) => p.value);
  const anomalies: Anomaly[] = [];
  const severity = (value: number, centre: number): AnomalySeverity =>
    value < centre ? 'high' : 'low';

  if (points.length >= thresholds.minTasksForZScore) {
    const m = mean(values);
    const sd = standardDeviation(values);
    if (sd === 0) return [];
    for (const { task, value } of points) {
      const z = (value - m) / sd;
      if (Math.abs(z) > thresholds.zScore) {
        anomalies.push({
          ruleId: 'AN-01',
          severity: severity(value, m),
          taskId: task.id,
          message: `Task ${task.id} has a cost variance of ${formatPercent(value)}, far from the other tasks (average ${formatPercent(m)}, z-score ${formatNumber(z)}).`,
        });
      }
    }
  } else if (points.length >= thresholds.minTasksForIqr) {
    const q1 = quantile(values, 0.25);
    const q3 = quantile(values, 0.75);
    const spread = thresholds.iqrMultiplier * (q3 - q1);
    const low = q1 - spread;
    const high = q3 + spread;
    for (const { task, value } of points) {
      if (value < low || value > high) {
        anomalies.push({
          ruleId: 'AN-01',
          severity: severity(value, median(values)),
          taskId: task.id,
          message: `Task ${task.id} has a cost variance of ${formatPercent(value)}, outside the typical range of ${formatPercent(low)} to ${formatPercent(high)} (IQR rule).`,
        });
      }
    }
  }
  return anomalies;
}

/** AN-02: money spent but no progress reported. */
export function detectSpendWithoutProgress(tasks: readonly Task[], currency?: string): Anomaly[] {
  return tasks
    .filter((task) => task.actualCost > 0 && task.percentComplete === 0)
    .map((task) => ({
      ruleId: 'AN-02',
      severity: 'medium' as const,
      taskId: task.id,
      message: `Task ${task.id} has spent ${money(task.actualCost, currency)} but is 0% complete.`,
    }));
}

/** AN-03: already over budget before the task is finished. */
export function detectOverBudgetIncomplete(tasks: readonly Task[], currency?: string): Anomaly[] {
  return tasks
    .filter((task) => task.actualCost > task.budget && task.percentComplete < 100)
    .map((task) => ({
      ruleId: 'AN-03',
      severity: 'high' as const,
      taskId: task.id,
      message: `Task ${task.id} has spent ${money(task.actualCost, currency)}, more than its budget of ${money(task.budget, currency)}, but is only ${formatPercent(task.percentComplete)} complete.`,
    }));
}

/** AN-04: a period's AC increase is more than 2× the median period increase. */
export function detectSpendingSpikes(
  snapshots: readonly StatusSnapshot[],
  thresholds: AnomalyThresholds = DEFAULT_ANOMALY_THRESHOLDS,
  currency?: string,
): Anomaly[] {
  const sorted = byDate(snapshots);
  const periods = sorted.slice(1).map((snapshot, i) => ({
    from: sorted[i]!.date,
    to: snapshot.date,
    increase: snapshot.ac - sorted[i]!.ac,
  }));
  if (periods.length < thresholds.minPeriodsForSpike) return [];
  const typical = median(periods.map((p) => p.increase));
  if (!(typical > 0)) return [];

  return periods
    .filter((p) => p.increase > thresholds.spikeMultiplier * typical)
    .map((p) => ({
      ruleId: 'AN-04',
      severity: 'medium' as const,
      snapshotDate: p.to,
      message: `Actual cost rose by ${money(p.increase, currency)} between ${p.from} and ${p.to}, more than ${formatNumber(thresholds.spikeMultiplier, 0)}× the median period increase of ${money(typical, currency)}.`,
    }));
}

/** AN-05: a task's % complete went down between snapshots. */
export function detectProgressRegression(snapshots: readonly StatusSnapshot[]): Anomaly[] {
  const sorted = byDate(snapshots);
  const anomalies: Anomaly[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1]!;
    const current = sorted[i]!;
    const before = new Map((previous.taskStates ?? []).map((s) => [s.taskId, s.percentComplete]));
    for (const state of current.taskStates ?? []) {
      const earlier = before.get(state.taskId);
      if (earlier !== undefined && state.percentComplete < earlier) {
        anomalies.push({
          ruleId: 'AN-05',
          severity: 'high',
          taskId: state.taskId,
          snapshotDate: current.date,
          message: `Task ${state.taskId} % complete went down from ${formatPercent(earlier)} to ${formatPercent(state.percentComplete)} between ${previous.date} and ${current.date}.`,
        });
      }
    }
  }
  return anomalies;
}

/** AN-06: 100% complete but less than half the budget spent (possible missing invoices). */
export function detectCompleteLowSpend(
  tasks: readonly Task[],
  thresholds: AnomalyThresholds = DEFAULT_ANOMALY_THRESHOLDS,
  currency?: string,
): Anomaly[] {
  return tasks
    .filter(
      (task) =>
        task.percentComplete === 100 &&
        task.budget > 0 &&
        task.actualCost < thresholds.lowSpendRatio * task.budget,
    )
    .map((task) => ({
      ruleId: 'AN-06',
      severity: 'low' as const,
      taskId: task.id,
      message: `Task ${task.id} is 100% complete but has spent only ${money(task.actualCost, currency)} (${formatPercent((task.actualCost * 100) / task.budget)} of its ${money(task.budget, currency)} budget). Check for missing invoices.`,
    }));
}

/** Runs AN-01…AN-06 and returns all anomalies in rule order. */
export function detectAnomalies(input: AnomalyInput): Anomaly[] {
  const t: AnomalyThresholds = { ...DEFAULT_ANOMALY_THRESHOLDS, ...input.thresholds };
  const snapshots = input.snapshots ?? [];
  return [
    ...detectCostVarianceOutliers(input.tasks, t),
    ...detectSpendWithoutProgress(input.tasks, input.currency),
    ...detectOverBudgetIncomplete(input.tasks, input.currency),
    ...detectSpendingSpikes(snapshots, t, input.currency),
    ...detectProgressRegression(snapshots),
    ...detectCompleteLowSpend(input.tasks, t, input.currency),
  ];
}

// ---------------------------------------------------------------------------
// Presentation helpers (FR-31)
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<AnomalySeverity, number> = { high: 0, medium: 1, low: 2 };

/** Most severe first; rule order is kept within a severity. */
export function sortAnomalies<T extends Pick<Anomaly, 'severity'>>(anomalies: readonly T[]): T[] {
  return [...anomalies].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function countAnomaliesBySeverity(
  anomalies: readonly Pick<Anomaly, 'severity'>[],
): Record<AnomalySeverity, number> {
  const counts: Record<AnomalySeverity, number> = { high: 0, medium: 0, low: 0 };
  for (const anomaly of anomalies) counts[anomaly.severity]++;
  return counts;
}

/** Task-level anomalies keyed by task ID (for row markers in task tables). */
export function groupAnomaliesByTask(anomalies: readonly Anomaly[]): Map<string, Anomaly[]> {
  const groups = new Map<string, Anomaly[]>();
  for (const anomaly of anomalies) {
    if (anomaly.taskId === undefined) continue;
    const list = groups.get(anomaly.taskId);
    if (list) list.push(anomaly);
    else groups.set(anomaly.taskId, [anomaly]);
  }
  return groups;
}
