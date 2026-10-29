// Chart data builders (FR-20…FR-23). Pure functions that arrange core results into chart
// series — no formulas here: every number comes from @evm/core.

import {
  type CategoryVariance,
  formatCurrency,
  formatIndex,
  isoFromDayNumber,
  parseIsoDate,
  plannedValueBaseline,
  type Project,
  type ProjectMetrics,
  snapshotMetrics,
  type StatusSnapshot,
  type Task,
  type TaskMetrics,
} from '@evm/core';

export interface XY {
  x: number;
  y: number;
}

const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

// ---------------------------------------------------------------------------
// FR-20 S-curve
// ---------------------------------------------------------------------------

export interface SCurveData {
  pv: XY[];
  ev: XY[];
  ac: XY[];
  /** Flat BAC line across the project (two points). */
  bac: XY[];
  /** EAC projection from the current AC to the end date (two points). */
  eac: XY[];
  statusDay: number | null;
  summary: string;
}

export function buildSCurveData(input: {
  project: Pick<Project, 'startDate' | 'endDate' | 'statusDate' | 'currency'>;
  tasks: readonly Task[];
  snapshots: readonly StatusSnapshot[];
  metrics: ProjectMetrics;
}): SCurveData {
  const { project, tasks, snapshots, metrics } = input;
  const startDay = parseIsoDate(project.startDate);
  const endDay = parseIsoDate(project.endDate);
  const statusDay = parseIsoDate(project.statusDate);

  const pv = plannedValueBaseline(tasks, project.startDate, project.endDate, {
    extraDates: [project.statusDate],
  }).map((p) => ({ x: p.day, y: p.pv }));

  // Snapshots, with the live figures as the point for the status date.
  const points = snapshots
    .filter((s) => s.date !== project.statusDate)
    .map((s) => ({ date: s.date, ev: s.ev as number | null, ac: s.ac as number | null }));
  points.push({ date: project.statusDate, ev: metrics.ev, ac: metrics.ac });
  points.sort(byDate);
  const series = (key: 'ev' | 'ac') =>
    points.flatMap((p) => {
      const x = parseIsoDate(p.date);
      const y = p[key];
      return x === null || y === null ? [] : [{ x, y }];
    });

  const bac =
    metrics.bac !== null && startDay !== null && endDay !== null
      ? [
          { x: startDay, y: metrics.bac },
          { x: endDay, y: metrics.bac },
        ]
      : [];
  const eac =
    metrics.eacPrimary !== null &&
    metrics.ac !== null &&
    statusDay !== null &&
    endDay !== null &&
    statusDay < endDay
      ? [
          { x: statusDay, y: metrics.ac },
          { x: endDay, y: metrics.eacPrimary },
        ]
      : [];

  const money = (v: number | null) => formatCurrency(v, project.currency);
  const summary =
    `S-curve from ${project.startDate} to ${project.endDate}. ` +
    `At the status date ${project.statusDate}: planned value ${money(metrics.pv)}, earned value ${money(metrics.ev)}, ` +
    `actual cost ${money(metrics.ac)}. Budget at completion ${money(metrics.bac)}; ` +
    `estimate at completion ${money(metrics.eacPrimary)}.`;

  return { pv, ev: series('ev'), ac: series('ac'), bac, eac, statusDay, summary };
}

// ---------------------------------------------------------------------------
// FR-21 Estimated vs actual per task
// ---------------------------------------------------------------------------

export type TaskSort = 'plan' | 'overrun';

export interface CostByTaskData {
  ids: string[];
  names: string[];
  estimated: number[];
  actual: number[];
  /** Tasks left out because of the display limit. */
  hidden: number;
  summary: string;
}

export const COST_CHART_LIMIT = 30;

export function buildCostByTaskData(
  tasks: readonly Task[],
  taskMetrics: readonly TaskMetrics[],
  sort: TaskSort,
  currency: string,
  limit = COST_CHART_LIMIT,
): CostByTaskData {
  const rows = tasks.map((task, i) => ({ task, variance: taskMetrics[i]?.variance ?? null }));
  // "Biggest overrun" = most negative simple variance (estimated − actual) first.
  if (sort === 'overrun') rows.sort((a, b) => (a.variance ?? 0) - (b.variance ?? 0));
  const shown = rows.slice(0, limit);

  const worst = [...rows].sort((a, b) => (a.variance ?? 0) - (b.variance ?? 0))[0];
  const overBudget = rows.filter((r) => r.variance !== null && r.variance < 0).length;
  const summary =
    tasks.length === 0
      ? 'No tasks yet.'
      : overBudget === 0
        ? `${tasks.length} tasks. No task has spent more than its estimate.`
        : `${tasks.length} tasks, ${overBudget} over their estimate. Biggest overrun: ${worst!.task.id} ${worst!.task.name}, ${formatCurrency(-(worst!.variance ?? 0), currency)} over.`;

  return {
    ids: shown.map((r) => r.task.id),
    names: shown.map((r) => r.task.name),
    estimated: shown.map((r) => r.task.budget),
    actual: shown.map((r) => r.task.actualCost),
    hidden: rows.length - shown.length,
    summary,
  };
}

// ---------------------------------------------------------------------------
// FR-22 CPI / SPI trend
// ---------------------------------------------------------------------------

export interface TrendData {
  labels: string[];
  cpi: (number | null)[];
  spi: (number | null)[];
  /** At least two snapshots are needed to draw a trend. */
  enough: boolean;
  summary: string;
}

export function buildTrendData(
  snapshots: readonly StatusSnapshot[],
  bac: number | null,
): TrendData {
  const sorted = [...snapshots].sort(byDate);
  const metrics = sorted.map((s) => snapshotMetrics(s, bac));
  const cpi = metrics.map((m) => m.cpi);
  const spi = metrics.map((m) => m.spi);
  const enough = sorted.length >= 2;
  const summary = enough
    ? `CPI and SPI over ${sorted.length} snapshots from ${sorted[0]!.date} to ${sorted.at(-1)!.date}. ` +
      `CPI went from ${formatIndex(cpi[0])} to ${formatIndex(cpi.at(-1))}; SPI from ${formatIndex(spi[0])} to ${formatIndex(spi.at(-1))}. ` +
      `1.00 is on target.`
    : 'Not enough snapshots to show a trend.';
  return { labels: sorted.map((s) => s.date), cpi, spi, enough, summary };
}

// ---------------------------------------------------------------------------
// FR-23 Cost variance by category
// ---------------------------------------------------------------------------

export interface CategoryData {
  labels: string[];
  values: number[];
  summary: string;
}

export function buildCategoryData(
  categories: readonly CategoryVariance[],
  currency: string,
): CategoryData {
  const rows = categories.filter((c) => c.cv !== null).sort((a, b) => (a.cv ?? 0) - (b.cv ?? 0));
  const negative = rows.filter((r) => (r.cv ?? 0) < 0);
  const summary =
    rows.length === 0
      ? 'No categories yet.'
      : negative.length === 0
        ? `${rows.length} categories, none over budget.`
        : `${rows.length} categories. Over budget: ${negative.map((r) => `${r.category} ${formatCurrency(r.cv, currency)}`).join(', ')}.`;
  return { labels: rows.map((r) => r.category), values: rows.map((r) => r.cv ?? 0), summary };
}

/** Axis tick label for a day number. */
export function dayLabel(day: number): string {
  return isoFromDayNumber(day);
}
