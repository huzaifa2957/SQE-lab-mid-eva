// EVM formulas (PROJECT_PLAN §4.1, §4.2).
//
// Every function is pure and returns a finite number or null — never NaN or
// Infinity (RL-01). A null input propagates to a null output. Nothing is rounded
// here; rounding happens only at display time (format.ts).

import { plannedValue } from './pv';
import type { EacMethod, EvmTotals, MetricValue, ProjectMetrics, Task, TaskMetrics } from './types';

export const DEFAULT_EAC_METHOD: EacMethod = 'typical';

// ---------------------------------------------------------------------------
// Safe arithmetic
// ---------------------------------------------------------------------------

/** Converts NaN, ±Infinity and non-numbers to null. */
export function finiteOrNull(value: number | null | undefined): MetricValue {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** a / b, or null when b is 0 or either side is null/non-finite. */
export function safeDivide(numerator: MetricValue, denominator: MetricValue): MetricValue {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return finiteOrNull(numerator / denominator);
}

function add(a: MetricValue, b: MetricValue): MetricValue {
  return a === null || b === null ? null : finiteOrNull(a + b);
}

function subtract(a: MetricValue, b: MetricValue): MetricValue {
  return a === null || b === null ? null : finiteOrNull(a - b);
}

/**
 * numerator / denominator × 100, or null when the denominator is 0.
 * Multiplies first so exact inputs give exact percentages (−2000 / 10000 → −20, not −20.000000000000004).
 */
function percentOf(numerator: MetricValue, denominator: MetricValue): MetricValue {
  return safeDivide(numerator === null ? null : numerator * 100, denominator);
}

/** Sum of values; null if any value is null. An empty list sums to 0. */
export function sumOf(values: readonly MetricValue[]): MetricValue {
  let total: MetricValue = 0;
  for (const value of values) total = add(total, finiteOrNull(value));
  return total;
}

// ---------------------------------------------------------------------------
// §4.1 Per task
// ---------------------------------------------------------------------------

/** Cost variance (simple) = budget − actualCost. */
export function simpleVariance(budget: MetricValue, actualCost: MetricValue): MetricValue {
  return subtract(budget, actualCost);
}

/** % variance (simple) = (budget − actualCost) / budget × 100. Budget 0 → null. */
export function simpleVariancePercent(budget: MetricValue, actualCost: MetricValue): MetricValue {
  return percentOf(simpleVariance(budget, actualCost), budget);
}

/** EV = budget × percentComplete / 100. */
export function earnedValue(budget: MetricValue, percentComplete: MetricValue): MetricValue {
  if (budget === null || percentComplete === null) return null;
  return finiteOrNull((budget * percentComplete) / 100);
}

/** CV = EV − AC. */
export function costVariance(ev: MetricValue, ac: MetricValue): MetricValue {
  return subtract(ev, ac);
}

/** SV = EV − PV. */
export function scheduleVariance(ev: MetricValue, pv: MetricValue): MetricValue {
  return subtract(ev, pv);
}

/** CPI = EV / AC. AC 0 → null. */
export function costPerformanceIndex(ev: MetricValue, ac: MetricValue): MetricValue {
  return safeDivide(ev, ac);
}

/** SPI = EV / PV. PV 0 → null. */
export function schedulePerformanceIndex(ev: MetricValue, pv: MetricValue): MetricValue {
  return safeDivide(ev, pv);
}

/** All §4.1 metrics for one task as of the status date. */
export function computeTaskMetrics(task: Task, statusDate: string): TaskMetrics {
  const budget = finiteOrNull(task.budget);
  const ac = finiteOrNull(task.actualCost);
  const pv = plannedValue(task, statusDate);
  const ev = earnedValue(budget, finiteOrNull(task.percentComplete));

  return {
    taskId: task.id,
    estimatedCost: budget,
    actualCost: ac,
    variance: simpleVariance(budget, ac),
    variancePercent: simpleVariancePercent(budget, ac),
    pv,
    ev,
    cv: costVariance(ev, ac),
    sv: scheduleVariance(ev, pv),
    cpi: costPerformanceIndex(ev, ac),
    spi: schedulePerformanceIndex(ev, pv),
  };
}

// ---------------------------------------------------------------------------
// §4.2 Project level
// ---------------------------------------------------------------------------

/** BAC = Σ budget. */
export function budgetAtCompletion(tasks: readonly Pick<Task, 'budget'>[]): MetricValue {
  return sumOf(tasks.map((task) => task.budget));
}

/** CV% = CV / EV × 100. EV 0 → null. */
export function costVariancePercent(cv: MetricValue, ev: MetricValue): MetricValue {
  return percentOf(cv, ev);
}

/** SV% = SV / PV × 100. PV 0 → null. */
export function scheduleVariancePercent(sv: MetricValue, pv: MetricValue): MetricValue {
  return percentOf(sv, pv);
}

/** EAC (typical) = BAC / CPI. CPI null or 0 → null. */
export function eacTypical(bac: MetricValue, cpi: MetricValue): MetricValue {
  return safeDivide(bac, cpi);
}

/** EAC (atypical) = AC + (BAC − EV). */
export function eacAtypical(bac: MetricValue, ev: MetricValue, ac: MetricValue): MetricValue {
  return add(ac, subtract(bac, ev));
}

/** EAC (combined) = AC + (BAC − EV) / (CPI × SPI). Null if either index is null or 0. */
export function eacCombined(
  bac: MetricValue,
  ev: MetricValue,
  ac: MetricValue,
  cpi: MetricValue,
  spi: MetricValue,
): MetricValue {
  if (cpi === null || spi === null || cpi === 0 || spi === 0) return null;
  return add(ac, safeDivide(subtract(bac, ev), cpi * spi));
}

/** ETC = EAC − AC. */
export function estimateToComplete(eac: MetricValue, ac: MetricValue): MetricValue {
  return subtract(eac, ac);
}

/** VAC = BAC − EAC. */
export function varianceAtCompletion(bac: MetricValue, eac: MetricValue): MetricValue {
  return subtract(bac, eac);
}

/** VAC% = VAC / BAC × 100. */
export function varianceAtCompletionPercent(vac: MetricValue, bac: MetricValue): MetricValue {
  return percentOf(vac, bac);
}

/** TCPI (to BAC) = (BAC − EV) / (BAC − AC). BAC = AC → null. */
export function toCompletePerformanceIndex(
  bac: MetricValue,
  ev: MetricValue,
  ac: MetricValue,
): MetricValue {
  return safeDivide(subtract(bac, ev), subtract(bac, ac));
}

/** % complete (project) = EV / BAC × 100. */
export function projectPercentComplete(ev: MetricValue, bac: MetricValue): MetricValue {
  return percentOf(ev, bac);
}

/** % spent = AC / BAC × 100. */
export function projectPercentSpent(ac: MetricValue, bac: MetricValue): MetricValue {
  return percentOf(ac, bac);
}

/**
 * All §4.2 metrics from cumulative totals. Used for the live project and for
 * stored/imported snapshots. ETC and VAC use the chosen primary EAC (FR-14).
 */
export function computeMetricsFromTotals(
  totals: EvmTotals,
  eacMethod: EacMethod = DEFAULT_EAC_METHOD,
): ProjectMetrics {
  const bac = finiteOrNull(totals.bac);
  const pv = finiteOrNull(totals.pv);
  const ev = finiteOrNull(totals.ev);
  const ac = finiteOrNull(totals.ac);

  const cv = costVariance(ev, ac);
  const sv = scheduleVariance(ev, pv);
  const cpi = costPerformanceIndex(ev, ac);
  const spi = schedulePerformanceIndex(ev, pv);

  const eac: Record<EacMethod, MetricValue> = {
    typical: eacTypical(bac, cpi),
    atypical: eacAtypical(bac, ev, ac),
    combined: eacCombined(bac, ev, ac, cpi, spi),
  };
  const eacPrimary = eac[eacMethod];
  const vac = varianceAtCompletion(bac, eacPrimary);

  return {
    bac,
    pv,
    ev,
    ac,
    variance: simpleVariance(bac, ac),
    variancePercent: simpleVariancePercent(bac, ac),
    cv,
    sv,
    cvPercent: costVariancePercent(cv, ev),
    svPercent: scheduleVariancePercent(sv, pv),
    cpi,
    spi,
    eac,
    eacMethod,
    eacPrimary,
    etc: estimateToComplete(eacPrimary, ac),
    vac,
    vacPercent: varianceAtCompletionPercent(vac, bac),
    tcpi: toCompletePerformanceIndex(bac, ev, ac),
    percentComplete: projectPercentComplete(ev, bac),
    percentSpent: projectPercentSpent(ac, bac),
  };
}

/** Sums task-level PV, EV and AC into project totals. */
export function sumTaskMetrics(
  tasks: readonly Task[],
  taskMetrics: readonly TaskMetrics[],
): EvmTotals {
  return {
    bac: budgetAtCompletion(tasks),
    pv: sumOf(taskMetrics.map((m) => m.pv)),
    ev: sumOf(taskMetrics.map((m) => m.ev)),
    ac: sumOf(taskMetrics.map((m) => m.actualCost)),
  };
}

/**
 * Project-level metrics (§4.2) for a set of tasks as of the status date.
 * Note: VR-13 (BAC must be > 0) is enforced by validation; with BAC = 0 the
 * BAC-based ratios here simply come back as null.
 */
export function computeProjectMetrics(
  tasks: readonly Task[],
  statusDate: string,
  eacMethod: EacMethod = DEFAULT_EAC_METHOD,
): ProjectMetrics {
  const taskMetrics = tasks.map((task) => computeTaskMetrics(task, statusDate));
  return computeMetricsFromTotals(sumTaskMetrics(tasks, taskMetrics), eacMethod);
}
