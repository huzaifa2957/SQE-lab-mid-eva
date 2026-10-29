// Status snapshots — progress over time (PROJECT_PLAN §3, FR-07).

import {
  computeMetricsFromTotals,
  computeTaskMetrics,
  DEFAULT_EAC_METHOD,
  sumTaskMetrics,
} from './evm';
import { parseIsoDate } from './pv';
import type { EacMethod, MetricValue, ProjectMetrics, StatusSnapshot, Task } from './types';

/**
 * Captures cumulative PV, EV and AC (plus each task's state) as of the status date.
 * Returns null when the date is invalid or a task's PV cannot be calculated.
 */
export function createSnapshot(tasks: readonly Task[], statusDate: string): StatusSnapshot | null {
  if (parseIsoDate(statusDate) === null) return null;
  const totals = sumTaskMetrics(
    tasks,
    tasks.map((task) => computeTaskMetrics(task, statusDate)),
  );
  if (totals.pv === null || totals.ev === null || totals.ac === null) return null;
  return {
    date: statusDate,
    pv: totals.pv,
    ev: totals.ev,
    ac: totals.ac,
    taskStates: tasks.map((task) => ({
      taskId: task.id,
      percentComplete: task.percentComplete,
      actualCost: task.actualCost,
    })),
  };
}

export function findSnapshot(
  snapshots: readonly StatusSnapshot[],
  date: string,
): StatusSnapshot | undefined {
  return snapshots.find((snapshot) => snapshot.date === date);
}

const byDate = (a: StatusSnapshot, b: StatusSnapshot) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

/** Adds the snapshot, replacing any existing one for the same date; result is in date order. */
export function upsertSnapshot(
  snapshots: readonly StatusSnapshot[],
  snapshot: StatusSnapshot,
): StatusSnapshot[] {
  return [...snapshots.filter((s) => s.date !== snapshot.date), snapshot].sort(byDate);
}

export function removeSnapshot(
  snapshots: readonly StatusSnapshot[],
  date: string,
): StatusSnapshot[] {
  return snapshots.filter((s) => s.date !== date);
}

/** The latest snapshot strictly before the status date (what KPI trend arrows compare to). */
export function previousSnapshot(
  snapshots: readonly StatusSnapshot[],
  statusDate: string,
): StatusSnapshot | undefined {
  return [...snapshots]
    .sort(byDate)
    .filter((s) => s.date < statusDate)
    .at(-1);
}

/**
 * §4.2 metrics for a stored snapshot. Snapshots don't store BAC, so the current BAC is used
 * (it only affects the BAC-based metrics: EAC, VAC, TCPI, % complete).
 */
export function snapshotMetrics(
  snapshot: Pick<StatusSnapshot, 'pv' | 'ev' | 'ac'>,
  bac: MetricValue,
  eacMethod: EacMethod = DEFAULT_EAC_METHOD,
): ProjectMetrics {
  return computeMetricsFromTotals(
    { bac, pv: snapshot.pv, ev: snapshot.ev, ac: snapshot.ac },
    eacMethod,
  );
}

export type TrendDirection = 'up' | 'down' | 'flat';

/** Direction of change from `previous` to `current`; null when either is unknown. */
export function trendDirection(
  current: MetricValue,
  previous: MetricValue,
  tolerance = 1e-9,
): TrendDirection | null {
  if (current === null || previous === null) return null;
  const change = current - previous;
  if (Math.abs(change) <= tolerance * Math.max(1, Math.abs(previous))) return 'flat';
  return change > 0 ? 'up' : 'down';
}
