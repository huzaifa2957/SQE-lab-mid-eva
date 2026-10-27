// Indicator-based insight rules IN-01…IN-12 (PROJECT_PLAN §5) and overall health (FR-27).

import { costPerformanceIndex } from './evm';
import { formatCurrency, formatIndex, formatNumber, formatPercent } from './format';
import type { MetricValue, ProjectMetrics, StatusSnapshot, Task, TaskMetrics } from './types';

export type InsightStatus = 'green' | 'amber' | 'red' | 'info';
export type HealthStatus = 'green' | 'amber' | 'red';

export interface Insight {
  ruleId: string;
  status: InsightStatus;
  message: string;
}

/** All insight thresholds in one place so they can be changed and tested (§5). */
export interface InsightThresholds {
  /** CPI/SPI at or above this is green (IN-01, IN-04). */
  indexOnTarget: number;
  /** CPI/SPI at or above this (but below target) is amber; below is red (IN-02/03, IN-05/06). */
  indexWarning: number;
  /** TCPI above this means recovery is unrealistic (IN-09). */
  tcpiUnrealistic: number;
  /** VAC% at or below this is red; a smaller forecast overrun is amber (IN-10). */
  vacRedPercent: number;
  /** Number of consecutive CPI drops between snapshots that triggers IN-11. */
  cpiFallingSnapshots: number;
  /** How many tasks to name as overrun contributors (IN-12). */
  topOverrunTasks: number;
}

export const DEFAULT_INSIGHT_THRESHOLDS: Readonly<InsightThresholds> = Object.freeze({
  indexOnTarget: 1.0,
  indexWarning: 0.9,
  tcpiUnrealistic: 1.1,
  vacRedPercent: -10,
  cpiFallingSnapshots: 3,
  topOverrunTasks: 3,
});

export interface InsightInput {
  metrics: ProjectMetrics;
  /** Per-task results (IN-12). */
  taskMetrics?: readonly TaskMetrics[];
  /** Task names for IN-12 messages. */
  tasks?: readonly Pick<Task, 'id' | 'name'>[];
  /** Snapshot history (IN-11). */
  snapshots?: readonly StatusSnapshot[];
  currency?: string;
  thresholds?: Partial<InsightThresholds>;
}

function money(value: number, currency: string | undefined): string {
  return currency ? formatCurrency(value, currency) : formatNumber(value);
}

/** IN-01…IN-03 */
function cpiInsight(cpi: number, t: InsightThresholds): Insight {
  const value = formatIndex(cpi);
  if (cpi >= t.indexOnTarget) {
    return {
      ruleId: 'IN-01',
      status: 'green',
      message: `Under budget: each 1 unit spent earns ${value} of value (CPI ${value}).`,
    };
  }
  if (cpi >= t.indexWarning) {
    return {
      ruleId: 'IN-02',
      status: 'amber',
      message: `Slight cost overrun: each 1 unit spent earns only ${value} of value (CPI ${value}).`,
    };
  }
  return {
    ruleId: 'IN-03',
    status: 'red',
    message: `Significant cost overrun: each 1 unit spent earns only ${value} of value (CPI ${value}).`,
  };
}

/** IN-04…IN-06 */
function spiInsight(spi: number, t: InsightThresholds): Insight {
  const value = formatIndex(spi);
  const done = formatPercent(spi * 100);
  if (spi >= t.indexOnTarget) {
    return {
      ruleId: 'IN-04',
      status: 'green',
      message: `On or ahead of schedule: ${done} of the planned work is done (SPI ${value}).`,
    };
  }
  if (spi >= t.indexWarning) {
    return {
      ruleId: 'IN-05',
      status: 'amber',
      message: `Slightly behind schedule: only ${done} of the planned work is done (SPI ${value}).`,
    };
  }
  return {
    ruleId: 'IN-06',
    status: 'red',
    message: `Significantly behind schedule: only ${done} of the planned work is done (SPI ${value}).`,
  };
}

/** Snapshot CPIs in date order. */
function snapshotCpis(snapshots: readonly StatusSnapshot[]): MetricValue[] {
  return [...snapshots]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((s) => costPerformanceIndex(s.ev, s.ac));
}

/** IN-11: CPI fell in each of the last N snapshot-to-snapshot steps. Returns the falling run, or null. */
export function fallingCpiRun(
  snapshots: readonly StatusSnapshot[],
  steps: number,
): number[] | null {
  const cpis = snapshotCpis(snapshots);
  if (steps < 1 || cpis.length < steps + 1) return null;
  const run = cpis.slice(-(steps + 1));
  for (let i = 1; i < run.length; i++) {
    const previous = run[i - 1];
    const current = run[i];
    if (previous === null || previous === undefined || current === null || current === undefined)
      return null;
    if (!(current < previous)) return null;
  }
  return run as number[];
}

/** Generates every triggered insight, most important first in §5 order. */
export function generateInsights(input: InsightInput): Insight[] {
  const t: InsightThresholds = { ...DEFAULT_INSIGHT_THRESHOLDS, ...input.thresholds };
  const { metrics, currency } = input;
  const { cpi, spi, tcpi, vac, vacPercent } = metrics;
  const insights: Insight[] = [];

  if (cpi !== null) insights.push(cpiInsight(cpi, t));
  if (spi !== null) insights.push(spiInsight(spi, t));

  if (cpi !== null && spi !== null) {
    const values = `CPI ${formatIndex(cpi)}, SPI ${formatIndex(spi)}`;
    if (cpi >= t.indexOnTarget && spi < t.indexOnTarget) {
      insights.push({
        ruleId: 'IN-07',
        status: 'info',
        message: `Low spending is due to slow progress, not efficiency (${values}).`,
      });
    }
    if (cpi < t.indexOnTarget && spi >= t.indexOnTarget) {
      insights.push({
        ruleId: 'IN-08',
        status: 'info',
        message: `Schedule is being bought with extra cost (${values}).`,
      });
    }
  }

  if (tcpi !== null && tcpi > t.tcpiUnrealistic) {
    const eac = metrics.eacPrimary === null ? '' : ` of ${money(metrics.eacPrimary, currency)}`;
    insights.push({
      ruleId: 'IN-09',
      status: 'red',
      message: `Recovering to budget is unrealistic: the remaining work would need a TCPI of ${formatIndex(tcpi)} (more than ${formatIndex(t.tcpiUnrealistic)}). Consider re-baselining to the EAC${eac}.`,
    });
  }

  if (vac !== null && vac < 0) {
    const percent = vacPercent === null ? '' : ` (${formatPercent(Math.abs(vacPercent))})`;
    insights.push({
      ruleId: 'IN-10',
      status: vacPercent !== null && vacPercent <= t.vacRedPercent ? 'red' : 'amber',
      message: `Forecast overrun of ${money(Math.abs(vac), currency)}${percent} at completion.`,
    });
  }

  const run = input.snapshots ? fallingCpiRun(input.snapshots, t.cpiFallingSnapshots) : null;
  if (run) {
    insights.push({
      ruleId: 'IN-11',
      status: 'amber',
      message: `Cost efficiency is trending down: CPI fell for ${t.cpiFallingSnapshots} consecutive snapshots (${run.map((cpi) => formatIndex(cpi)).join(' → ')}).`,
    });
  }

  const contributors = topOverrunTasks(input.taskMetrics ?? [], t.topOverrunTasks);
  if (contributors.length > 0) {
    const names = new Map((input.tasks ?? []).map((task) => [task.id, task.name]));
    const list = contributors
      .map((m) => {
        const name = names.get(m.taskId);
        return `${m.taskId}${name ? ` ${name}` : ''} (CV ${money(m.cv!, currency)})`;
      })
      .join(', ');
    insights.push({
      ruleId: 'IN-12',
      status: 'info',
      message: `Main contributors to overrun: ${list}.`,
    });
  }

  return insights;
}

/** IN-12: tasks with the most negative CV, worst first. */
export function topOverrunTasks(taskMetrics: readonly TaskMetrics[], count: number): TaskMetrics[] {
  return taskMetrics
    .filter((m) => m.cv !== null && m.cv < 0)
    .sort((a, b) => a.cv! - b.cv!)
    .slice(0, Math.max(0, count));
}

/**
 * FR-27: overall health is the worst status among the non-info insights.
 * Returns null when nothing could be assessed (e.g. no CPI or SPI yet).
 */
export function overallHealth(insights: readonly Insight[]): HealthStatus | null {
  const statuses = insights.map((i) => i.status).filter((s): s is HealthStatus => s !== 'info');
  if (statuses.includes('red')) return 'red';
  if (statuses.includes('amber')) return 'amber';
  return statuses.length > 0 ? 'green' : null;
}
