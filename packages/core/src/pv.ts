// Planned value distribution over time (PROJECT_PLAN §4.1).
//
// Assumption: budget is spread linearly across the planned duration, measured in
// whole calendar days between ISO dates (UTC midnight). PV can be overridden by
// imported snapshots.

import type { MetricValue, Task } from './types';

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

/**
 * Parses the date part of an ISO string ("2026-03-11" or "2026-03-11T…") into a
 * day number (days since 1970-01-01 UTC). Returns null for malformed or impossible
 * dates such as "2026-02-30".
 */
export function parseIsoDate(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const ms = Date.UTC(y, m - 1, d);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return ms / MS_PER_DAY;
}

/**
 * Share of the planned work scheduled to be done by the status date, in [0, 1]:
 * clamp((statusDate − start) / (finish − start), 0, 1).
 * When start = finish (a milestone) it is 0 before that date and 1 on/after it.
 * Returns null for invalid dates or finish < start.
 */
export function plannedFraction(
  plannedStart: string,
  plannedFinish: string,
  statusDate: string,
): MetricValue {
  const start = parseIsoDate(plannedStart);
  const finish = parseIsoDate(plannedFinish);
  const status = parseIsoDate(statusDate);
  if (start === null || finish === null || status === null || finish < start) return null;

  if (finish === start) return status < start ? 0 : 1;
  return Math.min(1, Math.max(0, (status - start) / (finish - start)));
}

/** PV for one task as of the status date: budget × plannedFraction. */
export function plannedValue(
  task: Pick<Task, 'budget' | 'plannedStart' | 'plannedFinish'>,
  statusDate: string,
): MetricValue {
  if (!Number.isFinite(task.budget)) return null;
  const fraction = plannedFraction(task.plannedStart, task.plannedFinish, statusDate);
  // A finite budget × a fraction in [0, 1] is always finite.
  return fraction === null ? null : task.budget * fraction;
}
