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
  return fractionOfDays(start, finish, status);
}

/** The plannedFraction rule on day numbers (finish ≥ start). */
function fractionOfDays(start: number, finish: number, status: number): number {
  if (finish === start) return status < start ? 0 : 1;
  return Math.min(1, Math.max(0, (status - start) / (finish - start)));
}

/** Day number (days since 1970-01-01 UTC) → "YYYY-MM-DD". */
export function isoFromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export interface PlannedValuePoint {
  date: string;
  day: number;
  pv: number;
}

/** Above this many tasks, task start/finish dates are not added as extra curve points. */
const MAX_TASKS_FOR_BREAKPOINTS = 250;

/**
 * FR-20: the time-phased PV baseline — cumulative PV from the project start to its end,
 * sampled every `stepDays` days plus each task's start/finish (where the curve bends)
 * and any `extraDates` (e.g. the status date). Tasks with invalid dates are skipped.
 * Returns [] when the project dates are invalid.
 */
export function plannedValueBaseline(
  tasks: readonly Pick<Task, 'budget' | 'plannedStart' | 'plannedFinish'>[],
  startDate: string,
  endDate: string,
  options: { stepDays?: number; extraDates?: readonly string[] } = {},
): PlannedValuePoint[] {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (start === null || end === null || end < start) return [];

  // Parse each task once: thousands of tasks × hundreds of dates must stay fast (NF-01).
  const parsed = tasks.flatMap((task) => {
    const s = parseIsoDate(task.plannedStart);
    const f = parseIsoDate(task.plannedFinish);
    return s === null || f === null || f < s || !Number.isFinite(task.budget)
      ? []
      : [{ budget: task.budget, s, f }];
  });

  const step = Math.max(1, Math.round(options.stepDays ?? 7));
  const days = new Set<number>([start, end]);
  for (let d = start + step; d < end; d += step) days.add(d);
  if (parsed.length <= MAX_TASKS_FOR_BREAKPOINTS) {
    for (const { s, f } of parsed) for (const d of [s, f]) if (d > start && d < end) days.add(d);
  }
  for (const extra of options.extraDates ?? []) {
    const d = parseIsoDate(extra);
    if (d !== null) days.add(d);
  }

  return [...days]
    .sort((a, b) => a - b)
    .map((day) => ({
      day,
      date: isoFromDayNumber(day),
      pv: parsed.reduce((sum, t) => sum + t.budget * fractionOfDays(t.s, t.f, day), 0),
    }));
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
