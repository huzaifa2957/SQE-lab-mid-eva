import { describe, expect, it } from 'vitest';
import {
  budgetAtCompletion,
  computeMetricsFromTotals,
  computeProjectMetrics,
  computeTaskMetrics,
  costPerformanceIndex,
  costVariance,
  costVariancePercent,
  DEFAULT_EAC_METHOD,
  eacAtypical,
  eacCombined,
  eacTypical,
  earnedValue,
  estimateToComplete,
  finiteOrNull,
  projectPercentComplete,
  projectPercentSpent,
  safeDivide,
  schedulePerformanceIndex,
  scheduleVariance,
  scheduleVariancePercent,
  simpleVariance,
  simpleVariancePercent,
  sumOf,
  toCompletePerformanceIndex,
  varianceAtCompletion,
  varianceAtCompletionPercent,
  type MetricValue,
  type ProjectMetrics,
  type Task,
} from '../src';

const baseTask: Task = {
  id: '1.1',
  name: 'Task',
  category: 'Labour',
  budget: 1000,
  plannedStart: '2026-03-01',
  plannedFinish: '2026-03-11',
  percentComplete: 50,
  actualCost: 400,
};

describe('safe arithmetic helpers', () => {
  it('finiteOrNull keeps finite numbers and nulls everything else', () => {
    expect(finiteOrNull(0)).toBe(0);
    expect(finiteOrNull(-1.5)).toBe(-1.5);
    expect(finiteOrNull(null)).toBeNull();
    expect(finiteOrNull(undefined)).toBeNull();
    expect(finiteOrNull(Number.NaN)).toBeNull();
    expect(finiteOrNull(Infinity)).toBeNull();
    expect(finiteOrNull(-Infinity)).toBeNull();
  });

  it('safeDivide returns null for 0, null or non-finite operands', () => {
    expect(safeDivide(1, 4)).toBe(0.25);
    expect(safeDivide(1, 0)).toBeNull();
    expect(safeDivide(0, 0)).toBeNull();
    expect(safeDivide(null, 2)).toBeNull();
    expect(safeDivide(2, null)).toBeNull();
    expect(safeDivide(1, Number.NaN)).toBeNull();
    expect(safeDivide(Number.MAX_VALUE, Number.MIN_VALUE)).toBeNull(); // overflow → Infinity
  });

  it('sumOf adds values, propagates null and returns 0 for an empty list', () => {
    expect(sumOf([1, 2, 3.5])).toBe(6.5);
    expect(sumOf([])).toBe(0);
    expect(sumOf([1, null, 3])).toBeNull();
    expect(sumOf([1, Number.NaN])).toBeNull();
    expect(sumOf([Number.MAX_VALUE, Number.MAX_VALUE])).toBeNull(); // overflow
  });
});

describe('§4.1 task-level formulas', () => {
  it('UT-EVM-01 simple cost variance = budget − actualCost', () => {
    expect(simpleVariance(1000, 400)).toBe(600); // under budget
    expect(simpleVariance(1000, 1200)).toBe(-200); // over budget
    expect(simpleVariance(1000, 1000)).toBe(0);
    expect(simpleVariance(null, 400)).toBeNull();
  });

  it('UT-EVM-02 simple % variance; budget = 0 → null', () => {
    expect(simpleVariancePercent(1000, 400)).toBe(60);
    expect(simpleVariancePercent(1000, 1200)).toBe(-20);
    expect(simpleVariancePercent(0, 0)).toBeNull();
    expect(simpleVariancePercent(0, 500)).toBeNull();
    expect(simpleVariancePercent(1000, null)).toBeNull();
  });

  it('UT-EVM-03 EV = budget × % complete / 100', () => {
    expect(earnedValue(1000, 50)).toBe(500);
    expect(earnedValue(1000, 0)).toBe(0);
    expect(earnedValue(1000, 100)).toBe(1000);
    expect(earnedValue(0, 75)).toBe(0);
    expect(earnedValue(null, 50)).toBeNull();
    expect(earnedValue(1000, null)).toBeNull();
  });

  it('UT-EVM-04 CV = EV − AC and SV = EV − PV', () => {
    expect(costVariance(500, 400)).toBe(100);
    expect(costVariance(500, 700)).toBe(-200);
    expect(scheduleVariance(500, 600)).toBe(-100);
    expect(scheduleVariance(500, 500)).toBe(0);
    expect(costVariance(null, 1)).toBeNull();
    expect(scheduleVariance(1, null)).toBeNull();
  });

  it('UT-EVM-05 CPI = EV / AC; AC = 0 → null', () => {
    expect(costPerformanceIndex(500, 400)).toBe(1.25);
    expect(costPerformanceIndex(400, 500)).toBe(0.8);
    expect(costPerformanceIndex(0, 400)).toBe(0);
    expect(costPerformanceIndex(500, 0)).toBeNull();
    expect(costPerformanceIndex(0, 0)).toBeNull();
  });

  it('UT-EVM-06 SPI = EV / PV; PV = 0 → null', () => {
    expect(schedulePerformanceIndex(500, 500)).toBe(1);
    expect(schedulePerformanceIndex(300, 600)).toBe(0.5);
    expect(schedulePerformanceIndex(500, 0)).toBeNull();
    expect(schedulePerformanceIndex(0, 0)).toBeNull();
  });

  it('UT-EVM-07 computeTaskMetrics returns every §4.1 metric', () => {
    // Status date at the midpoint → PV = 500
    expect(computeTaskMetrics(baseTask, '2026-03-06')).toEqual({
      taskId: '1.1',
      estimatedCost: 1000,
      actualCost: 400,
      variance: 600,
      variancePercent: 60,
      pv: 500,
      ev: 500,
      cv: 100,
      sv: 0,
      cpi: 1.25,
      spi: 1,
    });
  });

  it('UT-EVM-08 computeTaskMetrics edge cases: zero budget, AC = 0, before start, after finish', () => {
    const zeroBudget = computeTaskMetrics({ ...baseTask, budget: 0, actualCost: 50 }, '2026-03-06');
    expect(zeroBudget.variancePercent).toBeNull();
    expect(zeroBudget.pv).toBe(0);
    expect(zeroBudget.ev).toBe(0);
    expect(zeroBudget.spi).toBeNull();
    expect(zeroBudget.cpi).toBe(0);

    const noCost = computeTaskMetrics({ ...baseTask, actualCost: 0 }, '2026-03-06');
    expect(noCost.cpi).toBeNull();
    expect(noCost.cv).toBe(500);

    const beforeStart = computeTaskMetrics(
      { ...baseTask, percentComplete: 0, actualCost: 0 },
      '2026-01-01',
    );
    expect(beforeStart.pv).toBe(0);
    expect(beforeStart.sv).toBe(0);
    expect(beforeStart.spi).toBeNull();
    expect(beforeStart.cpi).toBeNull();

    const afterFinish = computeTaskMetrics(baseTask, '2026-12-31');
    expect(afterFinish.pv).toBe(1000);
    expect(afterFinish.sv).toBe(-500);
    expect(afterFinish.spi).toBe(0.5);
  });

  it('UT-EVM-08b computeTaskMetrics turns non-finite inputs and bad dates into null, never NaN', () => {
    const broken = computeTaskMetrics(
      { ...baseTask, budget: Number.NaN, actualCost: Infinity, plannedStart: 'x' },
      '2026-03-06',
    );
    for (const value of Object.values(broken)) {
      if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
    }
    expect(broken.estimatedCost).toBeNull();
    expect(broken.actualCost).toBeNull();
    expect(broken.pv).toBeNull();
    expect(broken.ev).toBeNull();
    expect(broken.sv).toBeNull();
  });
});

describe('§4.2 project-level formulas', () => {
  it('UT-EVM-09 BAC = Σ budget', () => {
    expect(budgetAtCompletion([{ budget: 100 }, { budget: 250.5 }, { budget: 0 }])).toBe(350.5);
    expect(budgetAtCompletion([])).toBe(0);
  });

  it('UT-EVM-10 CV% = CV / EV × 100; EV = 0 → null', () => {
    expect(costVariancePercent(-8000, 32000)).toBe(-25);
    expect(costVariancePercent(500, 0)).toBeNull();
  });

  it('UT-EVM-11 SV% = SV / PV × 100; PV = 0 → null', () => {
    expect(scheduleVariancePercent(-8000, 40000)).toBe(-20);
    expect(scheduleVariancePercent(0, 0)).toBeNull();
  });

  it('UT-EVM-12 EAC (typical) = BAC / CPI; CPI null or 0 → null', () => {
    expect(eacTypical(100_000, 0.8)).toBeCloseTo(125_000, 6);
    expect(eacTypical(100_000, 1.25)).toBe(80_000);
    expect(eacTypical(100_000, null)).toBeNull();
    expect(eacTypical(100_000, 0)).toBeNull();
  });

  it('UT-EVM-13 EAC (atypical) = AC + (BAC − EV)', () => {
    expect(eacAtypical(100_000, 32_000, 40_000)).toBe(108_000);
    expect(eacAtypical(100_000, 0, 0)).toBe(100_000);
    expect(eacAtypical(100_000, null, 0)).toBeNull();
  });

  it('UT-EVM-14 EAC (combined) = AC + (BAC − EV) / (CPI × SPI); null if either index null/0', () => {
    expect(eacCombined(100_000, 32_000, 40_000, 0.8, 0.8)).toBeCloseTo(146_250, 6);
    expect(eacCombined(100_000, 50_000, 50_000, 1, 1)).toBe(100_000);
    expect(eacCombined(100_000, 32_000, 40_000, null, 0.8)).toBeNull();
    expect(eacCombined(100_000, 32_000, 40_000, 0.8, null)).toBeNull();
    expect(eacCombined(100_000, 32_000, 40_000, 0, 0.8)).toBeNull();
    expect(eacCombined(100_000, 32_000, 40_000, 0.8, 0)).toBeNull();
  });

  it('UT-EVM-15 ETC = EAC − AC, VAC = BAC − EAC, VAC% = VAC / BAC × 100', () => {
    expect(estimateToComplete(125_000, 40_000)).toBe(85_000);
    expect(varianceAtCompletion(100_000, 125_000)).toBe(-25_000);
    expect(varianceAtCompletion(100_000, 80_000)).toBe(20_000);
    expect(varianceAtCompletionPercent(-25_000, 100_000)).toBe(-25);
    // null EAC propagates
    expect(estimateToComplete(null, 40_000)).toBeNull();
    expect(varianceAtCompletion(100_000, null)).toBeNull();
    expect(varianceAtCompletionPercent(null, 100_000)).toBeNull();
    // BAC = 0 → VAC% undefined
    expect(varianceAtCompletionPercent(-10, 0)).toBeNull();
  });

  it('UT-EVM-16 TCPI = (BAC − EV) / (BAC − AC); BAC = AC → null', () => {
    expect(toCompletePerformanceIndex(100_000, 32_000, 40_000)).toBeCloseTo(68 / 60, 12);
    expect(toCompletePerformanceIndex(100_000, 50_000, 50_000)).toBe(1);
    expect(toCompletePerformanceIndex(100_000, 40_000, 100_000)).toBeNull();
    // AC > BAC: negative denominator is a valid (if alarming) result, not an error
    expect(toCompletePerformanceIndex(100_000, 60_000, 120_000)).toBe(-2);
  });

  it('UT-EVM-17 % complete = EV / BAC × 100 and % spent = AC / BAC × 100; BAC = 0 → null', () => {
    expect(projectPercentComplete(32_000, 100_000)).toBe(32);
    expect(projectPercentSpent(40_000, 100_000)).toBe(40);
    expect(projectPercentComplete(0, 0)).toBeNull();
    expect(projectPercentSpent(10, 0)).toBeNull();
  });

  it('UT-EVM-18 primary EAC method selects ETC/VAC basis (FR-14); default is typical', () => {
    const totals = { bac: 100_000, pv: 40_000, ev: 32_000, ac: 40_000 };
    expect(DEFAULT_EAC_METHOD).toBe('typical');
    expect(computeMetricsFromTotals(totals).eacMethod).toBe('typical');

    const atypical = computeMetricsFromTotals(totals, 'atypical');
    expect(atypical.eacPrimary).toBe(108_000);
    expect(atypical.etc).toBe(68_000);
    expect(atypical.vac).toBe(-8_000);
    expect(atypical.vacPercent).toBe(-8);

    const combined = computeMetricsFromTotals(totals, 'combined');
    expect(combined.eacPrimary).toBeCloseTo(146_250, 6);
    expect(combined.vac).toBeCloseTo(-46_250, 6);

    // All three methods are always reported regardless of the primary one
    expect(Object.keys(combined.eac).sort()).toEqual(['atypical', 'combined', 'typical']);
  });

  it('UT-EVM-19 never returns NaN or Infinity across edge-case inputs (RL-01)', () => {
    const samples: MetricValue[] = [0, 1, -1, 0.5, 1e12, -1e12, 1e-300, null, Number.NaN, Infinity];
    const unsafe: string[] = [];
    const check = (metrics: ProjectMetrics, label: string) => {
      for (const [key, value] of Object.entries({ ...metrics, ...metrics.eac })) {
        if (typeof value === 'number' && !Number.isFinite(value)) {
          unsafe.push(`${label} ${key}=${value}`);
        }
      }
    };
    for (const bac of samples)
      for (const pv of samples)
        for (const ev of samples)
          for (const ac of samples)
            check(
              computeMetricsFromTotals({ bac, pv, ev, ac }, 'combined'),
              `${bac}/${pv}/${ev}/${ac}`,
            );
    expect(unsafe).toEqual([]);
  });

  it('UT-EVM-20 intermediate values are not rounded', () => {
    const m = computeMetricsFromTotals({ bac: 300, pv: 30, ev: 10, ac: 30 });
    expect(m.cpi).toBe(1 / 3);
    expect(m.eacPrimary).toBe(300 / (1 / 3));
    expect(m.cvPercent).toBe(-200);
    expect(m.percentComplete).toBe(1000 / 300);
  });

  it('UT-EVM-21 empty project (BAC = 0): ratios are null, sums are 0', () => {
    const m = computeProjectMetrics([], '2026-03-11');
    expect(m.bac).toBe(0);
    expect(m.pv).toBe(0);
    expect(m.ev).toBe(0);
    expect(m.ac).toBe(0);
    expect(m.cpi).toBeNull();
    expect(m.spi).toBeNull();
    expect(m.eac).toEqual({ typical: null, atypical: 0, combined: null });
    expect(m.etc).toBeNull();
    expect(m.vac).toBeNull();
    expect(m.vacPercent).toBeNull();
    expect(m.tcpi).toBeNull(); // BAC = AC = 0
    expect(m.percentComplete).toBeNull();
    expect(m.percentSpent).toBeNull();
    expect(m.variancePercent).toBeNull();
  });

  it('UT-EVM-22 a task with invalid dates makes project PV-based metrics null, cost metrics stay', () => {
    const tasks = [baseTask, { ...baseTask, id: '1.2', plannedStart: 'bad' }];
    const m = computeProjectMetrics(tasks, '2026-03-06');
    expect(m.pv).toBeNull();
    expect(m.sv).toBeNull();
    expect(m.spi).toBeNull();
    expect(m.eac.combined).toBeNull();
    expect(m.ev).toBe(1000);
    expect(m.ac).toBe(800);
    expect(m.cpi).toBe(1.25);
  });

  it('UT-EVM-23 changing the status date recalculates PV-dependent metrics (FR-15)', () => {
    const early = computeProjectMetrics([baseTask], '2026-03-03'); // 20% elapsed
    const late = computeProjectMetrics([baseTask], '2026-03-09'); // 80% elapsed
    expect(early.pv).toBe(200);
    expect(early.spi).toBe(2.5);
    expect(late.pv).toBe(800);
    expect(late.spi).toBe(0.625);
    expect(early.cpi).toBe(late.cpi); // cost side is independent of the status date
  });
});
