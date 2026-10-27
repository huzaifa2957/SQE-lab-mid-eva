// Status snapshots — progress over time (PROJECT_PLAN §3, FR-07).

import { computeTaskMetrics, sumTaskMetrics } from './evm';
import { parseIsoDate } from './pv';
import type { StatusSnapshot, Task } from './types';

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

/** Adds the snapshot, replacing any existing one for the same date; result is in date order. */
export function upsertSnapshot(
  snapshots: readonly StatusSnapshot[],
  snapshot: StatusSnapshot,
): StatusSnapshot[] {
  return [...snapshots.filter((s) => s.date !== snapshot.date), snapshot].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}
