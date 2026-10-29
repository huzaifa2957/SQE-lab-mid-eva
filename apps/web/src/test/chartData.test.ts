// FR-20…FR-23: chart datasets are built correctly from core data (no canvas involved).

import {
  computeProjectMetrics,
  computeTaskMetrics,
  parseIsoDate,
  type ProjectDocument,
  varianceByCategory,
} from '@evm/core';
import { describe, expect, it } from 'vitest';
import {
  buildCategoryData,
  buildCostByTaskData,
  buildSCurveData,
  buildTrendData,
  dayLabel,
} from '../lib/chartData';
import { buildSampleDocument } from '../lib/sampleProject';

const sample: ProjectDocument = buildSampleDocument('s', '2026-04-03T00:00:00.000Z');
const { project, tasks, snapshots } = sample;
const metrics = computeProjectMetrics(tasks, project.statusDate);
const taskMetrics = tasks.map((t) => computeTaskMetrics(t, project.statusDate));
const day = (iso: string) => parseIsoDate(iso)!;

describe('S-curve data (FR-20)', () => {
  const data = buildSCurveData({ project, tasks, snapshots, metrics });

  it('UT-CHART-01 PV baseline spans the whole project, from 0 to BAC, and hits PV at the status date', () => {
    expect(data.pv[0]).toEqual({ x: day('2026-01-05'), y: 0 });
    expect(data.pv.at(-1)).toEqual({ x: day('2026-06-26'), y: 1_040_000 });
    expect(data.pv.find((p) => p.x === day(project.statusDate))!.y).toBeCloseTo(metrics.pv!, 6);
  });

  it('UT-CHART-02 EV and AC come from snapshots plus the live status point (no duplicate date)', () => {
    expect(data.ev).toHaveLength(6); // last snapshot = status date → replaced by the live point
    expect(data.ac.at(-1)).toEqual({ x: day('2026-04-03'), y: 570_000 });
    expect(data.ev[0]).toEqual({ x: day('2026-01-23'), y: 60_248 });
    expect(data.ev.map((p) => p.x)).toEqual([...data.ev.map((p) => p.x)].sort((a, b) => a - b));
  });

  it('UT-CHART-03 BAC line, EAC projection and status marker', () => {
    expect(data.bac).toEqual([
      { x: day('2026-01-05'), y: 1_040_000 },
      { x: day('2026-06-26'), y: 1_040_000 },
    ]);
    expect(data.eac[0]).toEqual({ x: day('2026-04-03'), y: 570_000 });
    expect(data.eac[1]!.x).toBe(day('2026-06-26'));
    expect(data.eac[1]!.y).toBeCloseTo(metrics.eacPrimary!, 6);
    expect(data.statusDay).toBe(day('2026-04-03'));
    expect(data.summary).toContain('At the status date 2026-04-03');
    expect(dayLabel(day('2026-04-03'))).toBe('2026-04-03');
  });

  it('UT-CHART-04 with no snapshots the S-curve still has the PV baseline and the current point', () => {
    const empty = buildSCurveData({ project, tasks, snapshots: [], metrics });
    expect(empty.pv.length).toBeGreaterThan(10);
    expect(empty.ev).toEqual([{ x: day('2026-04-03'), y: 496_000 }]);
    expect(empty.ac).toEqual([{ x: day('2026-04-03'), y: 570_000 }]);
  });

  it('UT-CHART-05 no EAC projection after the end date or when EAC is N/A', () => {
    const late = buildSCurveData({
      project: { ...project, statusDate: '2026-07-01' },
      tasks,
      snapshots,
      metrics,
    });
    expect(late.eac).toEqual([]);
    const noCost = computeProjectMetrics(
      tasks.map((t) => ({ ...t, actualCost: 0 })),
      project.statusDate,
    );
    expect(buildSCurveData({ project, tasks, snapshots: [], metrics: noCost }).eac).toEqual([]);
  });
});

describe('estimated vs actual (FR-21)', () => {
  it('UT-CHART-06 plan order keeps the task order; overrun order puts the biggest overrun first', () => {
    const plan = buildCostByTaskData(tasks, taskMetrics, 'plan', 'PKR');
    expect(plan.ids.slice(0, 3)).toEqual(['1.1', '1.2', '1.3']);
    expect(plan.estimated[0]).toBe(50_000);
    expect(plan.actual[0]).toBe(48_000);

    const overrun = buildCostByTaskData(tasks, taskMetrics, 'overrun', 'PKR');
    expect(overrun.ids[0]).toBe('2.2'); // 150,000 budget, 172,000 spent → −22,000
    expect(overrun.summary).toMatch(/3 over their estimate\. Biggest overrun: 2\.2 Foundations/);
  });

  it('UT-CHART-07 limits the number of bars and reports how many are hidden', () => {
    const limited = buildCostByTaskData(tasks, taskMetrics, 'plan', 'PKR', 5);
    expect(limited.ids).toHaveLength(5);
    expect(limited.hidden).toBe(7);
    expect(buildCostByTaskData([], [], 'plan', 'PKR').summary).toBe('No tasks yet.');
  });
});

describe('CPI / SPI trend (FR-22)', () => {
  it('UT-CHART-08 one point per snapshot in date order, CPI/SPI from core', () => {
    const data = buildTrendData([...snapshots].reverse(), metrics.bac);
    expect(data.enough).toBe(true);
    expect(data.labels).toEqual([
      '2026-01-23',
      '2026-02-06',
      '2026-02-20',
      '2026-03-06',
      '2026-03-20',
      '2026-04-03',
    ]);
    expect(data.cpi[0]).toBeCloseTo(60_248 / 57_931, 9);
    expect(data.cpi.at(-1)).toBeCloseTo(496_000 / 570_000, 9);
    expect(data.spi[0]).toBeCloseTo(60_248 / 59_066.67, 9);
  });

  it('UT-CHART-09 fewer than two snapshots → not enough for a trend', () => {
    expect(buildTrendData(snapshots.slice(0, 1), metrics.bac).enough).toBe(false);
    expect(buildTrendData([], null).summary).toBe('Not enough snapshots to show a trend.');
  });
});

describe('variance by category (FR-23)', () => {
  it('UT-CHART-10 sorted worst first; values are EV − AC from core', () => {
    const data = buildCategoryData(varianceByCategory(tasks, taskMetrics), 'PKR');
    const sum = (ids: string[]) =>
      tasks.reduce((s, t, i) => (ids.includes(t.id) ? s + (taskMetrics[i]!.cv ?? 0) : s), 0);
    // Subcontract: 2.2 −22,000 + 3.1 −5,500 + 3.2 −4,000 = −31,500 (Material is −28,000)
    expect(data.labels[0]).toBe('Subcontract');
    expect(data.values[0]).toBeCloseTo(sum(['2.2', '3.1', '3.2']), 6);
    expect(data.values[0]).toBeCloseTo(-31_500, 6);
    expect(data.labels[1]).toBe('Material');
    expect(data.values).toEqual([...data.values].sort((a, b) => a - b));
    expect(data.summary).toContain('Over budget: Subcontract');
  });
});
