// Core helpers added for the Phase 4 dashboard: PV baseline, snapshot metrics, trends,
// KPI statuses, insight ordering, category variance and the glossary.

import { describe, expect, it } from 'vitest';
import {
  computeMetricsFromTotals,
  computeProjectMetrics,
  computeTaskMetrics,
  generateInsights,
  headlineInsight,
  INSIGHT_TIPS,
  type Insight,
  isoFromDayNumber,
  KPI_HIGHER_IS_BETTER,
  kpiStatuses,
  METRIC_DEFINITIONS,
  parseIsoDate,
  plannedValueBaseline,
  previousSnapshot,
  removeSnapshot,
  snapshotMetrics,
  sortInsights,
  type Task,
  trendDirection,
  varianceByCategory,
} from '../src';
import { workedProject, workedTasks } from './fixtures/worked-example';

describe('PV baseline (FR-20)', () => {
  it('UT-PVB-01 cumulative PV from start to end; matches the worked example at the status date', () => {
    const curve = plannedValueBaseline(
      workedTasks,
      workedProject.startDate,
      workedProject.endDate,
      {
        extraDates: [workedProject.statusDate],
      },
    );
    expect(curve[0]).toEqual({ date: '2026-01-01', day: parseIsoDate('2026-01-01'), pv: 0 });
    expect(curve.at(-1)).toMatchObject({ date: '2026-04-30', pv: 100_000 });
    expect(curve.find((p) => p.date === '2026-03-11')!.pv).toBe(40_000);
    // non-decreasing and in date order
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]!.day).toBeGreaterThan(curve[i - 1]!.day);
      expect(curve[i]!.pv).toBeGreaterThanOrEqual(curve[i - 1]!.pv);
    }
    // includes task breakpoints (where the curve bends)
    expect(curve.map((p) => p.date)).toEqual(
      expect.arrayContaining(['2026-01-31', '2026-03-21', '2026-04-10']),
    );
  });

  it('UT-PVB-02 agrees with plannedValue for every point', () => {
    const curve = plannedValueBaseline(workedTasks, '2026-01-01', '2026-04-30', { stepDays: 3 });
    for (const point of curve) {
      expect(point.pv).toBeCloseTo(computeProjectMetrics(workedTasks, point.date).pv!, 9);
    }
  });

  it('UT-PVB-03 invalid project dates → []; invalid tasks skipped; step is at least 1 day', () => {
    expect(plannedValueBaseline(workedTasks, 'x', '2026-04-30')).toEqual([]);
    expect(plannedValueBaseline(workedTasks, '2026-05-01', '2026-04-30')).toEqual([]);
    const bad = [{ ...workedTasks[0]!, plannedStart: 'bad' }, workedTasks[1]!];
    expect(plannedValueBaseline(bad, '2026-01-01', '2026-04-30').at(-1)!.pv).toBe(20_000);
    expect(plannedValueBaseline([], '2026-01-01', '2026-01-04', { stepDays: 0 })).toHaveLength(4);
    expect(isoFromDayNumber(parseIsoDate('2026-03-11')!)).toBe('2026-03-11');
  });

  it('UT-PVB-04 1,000 tasks over two years stays fast (NF-01)', () => {
    const tasks: Task[] = Array.from({ length: 1000 }, (_, i) => ({
      ...workedTasks[i % 5]!,
      id: `T${i}`,
    }));
    const t0 = performance.now();
    const curve = plannedValueBaseline(tasks, '2025-01-01', '2026-12-31');
    const metrics = computeProjectMetrics(tasks, '2026-03-11');
    generateInsights({
      metrics,
      taskMetrics: tasks.map((t) => computeTaskMetrics(t, '2026-03-11')),
      tasks,
    });
    expect(performance.now() - t0).toBeLessThan(200);
    expect(curve.length).toBeGreaterThan(100);
  });
});

describe('snapshot helpers (FR-17, FR-25)', () => {
  const snaps = [
    { date: '2026-03-01', pv: 100, ev: 90, ac: 100 },
    { date: '2026-01-01', pv: 10, ev: 10, ac: 10 },
    { date: '2026-04-01', pv: 200, ev: 150, ac: 200 },
  ];

  it('UT-SNH-01 previousSnapshot is the latest one strictly before the status date', () => {
    expect(previousSnapshot(snaps, '2026-04-01')!.date).toBe('2026-03-01');
    expect(previousSnapshot(snaps, '2026-05-01')!.date).toBe('2026-04-01');
    expect(previousSnapshot(snaps, '2026-01-01')).toBeUndefined();
  });

  it('UT-SNH-02 removeSnapshot and snapshotMetrics', () => {
    expect(removeSnapshot(snaps, '2026-03-01').map((s) => s.date)).toEqual([
      '2026-01-01',
      '2026-04-01',
    ]);
    const m = snapshotMetrics(snaps[0]!, 1000, 'atypical');
    expect(m.cpi).toBe(0.9);
    expect(m.spi).toBe(0.9);
    expect(m.eacMethod).toBe('atypical');
    expect(m.eacPrimary).toBe(1010);
  });

  it('UT-SNH-03 trendDirection', () => {
    expect(trendDirection(0.9, 0.8)).toBe('up');
    expect(trendDirection(0.8, 0.9)).toBe('down');
    expect(trendDirection(0.9, 0.9)).toBe('flat');
    expect(trendDirection(0.1 + 0.2, 0.3)).toBe('flat'); // floating-point noise
    expect(trendDirection(null, 0.9)).toBeNull();
    expect(trendDirection(0.9, null)).toBeNull();
  });
});

describe('KPI statuses (FR-25)', () => {
  const metrics = (bac: number, pv: number, ev: number, ac: number) =>
    computeMetricsFromTotals({ bac, pv, ev, ac });

  it('UT-KPI-01 healthy project: all green', () => {
    expect(kpiStatuses(metrics(1000, 400, 500, 400))).toEqual({
      cpi: 'green',
      spi: 'green',
      cv: 'green',
      sv: 'green',
      eac: 'green',
      vac: 'green',
      tcpi: 'green',
      percentComplete: null,
    });
  });

  it('UT-KPI-02 bands follow the §5 thresholds', () => {
    // CPI 0.95 amber, SPI 0.8 red; VAC% −5.26 amber; TCPI 500/475 = 1.05 amber
    const s = kpiStatuses(metrics(1000, 625, 500, 500 / 0.95));
    expect(s).toMatchObject({
      cpi: 'amber',
      cv: 'amber',
      spi: 'red',
      sv: 'red',
      vac: 'amber',
      eac: 'amber',
      tcpi: 'amber',
    });
    // CPI 0.8: VAC% −25 red; TCPI 500/375 red
    expect(kpiStatuses(metrics(1000, 500, 500, 625))).toMatchObject({
      cpi: 'red',
      vac: 'red',
      tcpi: 'red',
    });
  });

  it('UT-KPI-03 unknown values give null statuses', () => {
    expect(kpiStatuses(metrics(0, 0, 0, 0))).toEqual({
      cpi: null,
      spi: null,
      cv: null,
      sv: null,
      eac: null,
      vac: null,
      tcpi: null,
      percentComplete: null,
    });
  });

  it('UT-KPI-04 thresholds can be overridden', () => {
    expect(kpiStatuses(metrics(1000, 500, 500, 500 / 0.85), { indexWarning: 0.8 }).cpi).toBe(
      'amber',
    );
  });

  it('UT-KPI-05 trend semantics are defined for every KPI', () => {
    expect(KPI_HIGHER_IS_BETTER).toMatchObject({ cpi: true, eac: false, tcpi: false, vac: true });
  });
});

describe('insight ordering and tips (FR-26)', () => {
  const i = (ruleId: string, status: Insight['status']): Insight => ({
    ruleId,
    status,
    message: '',
  });

  it('UT-INO-01 sortInsights: red, amber, info, green; stable within a status', () => {
    const sorted = sortInsights([
      i('IN-01', 'green'),
      i('IN-12', 'info'),
      i('IN-05', 'amber'),
      i('IN-03', 'red'),
      i('IN-09', 'red'),
    ]);
    expect(sorted.map((x) => x.ruleId)).toEqual(['IN-03', 'IN-09', 'IN-05', 'IN-12', 'IN-01']);
    expect(headlineInsight(sorted)!.ruleId).toBe('IN-03');
    expect(headlineInsight([])).toBeNull();
  });

  it('UT-INO-02 every insight rule has a tip', () => {
    for (let n = 1; n <= 12; n++)
      expect(INSIGHT_TIPS[`IN-${String(n).padStart(2, '0')}`]).toBeTruthy();
  });
});

describe('variance by category (FR-23)', () => {
  it('UT-CAT-01 groups the worked example by category', () => {
    const metrics = workedTasks.map((t) => computeTaskMetrics(t, workedProject.statusDate));
    expect(varianceByCategory(workedTasks, metrics)).toEqual([
      {
        category: 'Labour',
        taskCount: 1,
        estimated: 10_000,
        actual: 12_000,
        ev: 10_000,
        variance: -2_000,
        cv: -2_000,
      },
      {
        category: 'Subcontract',
        taskCount: 2,
        estimated: 60_000,
        actual: 22_000,
        ev: 16_000,
        variance: 38_000,
        cv: -6_000,
      },
      {
        category: 'Material',
        taskCount: 1,
        estimated: 20_000,
        actual: 0,
        ev: 0,
        variance: 20_000,
        cv: 0,
      },
      {
        category: 'Other',
        taskCount: 1,
        estimated: 10_000,
        actual: 6_000,
        ev: 6_000,
        variance: 4_000,
        cv: 0,
      },
    ]);
    expect(varianceByCategory([], [])).toEqual([]);
  });
});

describe('glossary (FR-16)', () => {
  it('UT-GLO-01 defines every §4 metric with a formula and meaning', () => {
    const ids = METRIC_DEFINITIONS.map((d) => d.id);
    for (const id of [
      'bac',
      'pv',
      'ev',
      'ac',
      'cv',
      'sv',
      'cpi',
      'spi',
      'eacTypical',
      'eacAtypical',
      'eacCombined',
      'etc',
      'vac',
      'tcpi',
      'percentComplete',
      'percentSpent',
    ]) {
      expect(ids).toContain(id);
    }
    for (const d of METRIC_DEFINITIONS) {
      expect(d.formula.length).toBeGreaterThan(2);
      expect(d.meaning.length).toBeGreaterThan(10);
    }
  });
});
