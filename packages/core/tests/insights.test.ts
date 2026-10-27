import { describe, expect, it } from 'vitest';
import {
  computeMetricsFromTotals,
  DEFAULT_INSIGHT_THRESHOLDS,
  fallingCpiRun,
  generateInsights,
  type Insight,
  overallHealth,
  type StatusSnapshot,
  type TaskMetrics,
  topOverrunTasks,
} from '../src';

/** Project metrics with the given CPI and SPI (BAC 1000, EV 500). */
function metricsFor(cpi: number, spi: number, bac = 1000, ev = 500) {
  return computeMetricsFromTotals({ bac, ev, ac: ev / cpi, pv: ev / spi });
}

// Exact boundaries: 900 / 1000 is exactly 0.9 in floating point.
const CPI_090 = computeMetricsFromTotals({ bac: 2000, pv: 900, ev: 900, ac: 1000 });
const SPI_090 = computeMetricsFromTotals({ bac: 2000, pv: 1000, ev: 900, ac: 900 });

const ids = (insights: Insight[]) => insights.map((i) => i.ruleId);
const find = (insights: Insight[], ruleId: string) => insights.find((i) => i.ruleId === ruleId);

describe('thresholds config (§5)', () => {
  it('UT-IN-00 all thresholds live in one frozen config object', () => {
    expect(DEFAULT_INSIGHT_THRESHOLDS).toEqual({
      indexOnTarget: 1,
      indexWarning: 0.9,
      tcpiUnrealistic: 1.1,
      vacRedPercent: -10,
      cpiFallingSnapshots: 3,
      topOverrunTasks: 3,
    });
    expect(Object.isFrozen(DEFAULT_INSIGHT_THRESHOLDS)).toBe(true);
  });
});

describe('IN-01…IN-03 CPI bands', () => {
  it('UT-IN-01-P CPI ≥ 1.00 → IN-01 green with the CPI filled in', () => {
    const insight = find(generateInsights({ metrics: metricsFor(1.25, 1) }), 'IN-01');
    expect(insight).toEqual({
      ruleId: 'IN-01',
      status: 'green',
      message: 'Under budget: each 1 unit spent earns 1.25 of value (CPI 1.25).',
    });
    expect(find(generateInsights({ metrics: metricsFor(1, 1) }), 'IN-01')).toBeDefined(); // boundary
  });

  it('UT-IN-01-F CPI < 1.00 → no IN-01', () => {
    expect(find(generateInsights({ metrics: metricsFor(0.99, 1) }), 'IN-01')).toBeUndefined();
  });

  it('UT-IN-02-P 0.90 ≤ CPI < 1.00 → IN-02 amber (0.90 inclusive)', () => {
    expect(find(generateInsights({ metrics: metricsFor(0.95, 1) }), 'IN-02')).toMatchObject({
      status: 'amber',
      message: 'Slight cost overrun: each 1 unit spent earns only 0.95 of value (CPI 0.95).',
    });
    expect(CPI_090.cpi).toBe(0.9);
    expect(find(generateInsights({ metrics: CPI_090 }), 'IN-02')).toBeDefined();
  });

  it('UT-IN-02-F CPI below 0.90 or at/above 1.00 → no IN-02', () => {
    expect(find(generateInsights({ metrics: metricsFor(0.8999, 1) }), 'IN-02')).toBeUndefined();
    expect(find(generateInsights({ metrics: metricsFor(1, 1) }), 'IN-02')).toBeUndefined();
  });

  it('UT-IN-03-P CPI < 0.90 → IN-03 red', () => {
    expect(find(generateInsights({ metrics: metricsFor(0.8, 1) }), 'IN-03')).toMatchObject({
      status: 'red',
      message: 'Significant cost overrun: each 1 unit spent earns only 0.80 of value (CPI 0.80).',
    });
  });

  it('UT-IN-03-F CPI = 0.90 → no IN-03', () => {
    expect(find(generateInsights({ metrics: CPI_090 }), 'IN-03')).toBeUndefined();
  });

  it('UT-IN-01-03-N CPI not available (AC = 0) → no CPI insight', () => {
    const metrics = computeMetricsFromTotals({ bac: 1000, pv: 100, ev: 100, ac: 0 });
    expect(
      ids(generateInsights({ metrics })).filter((id) => ['IN-01', 'IN-02', 'IN-03'].includes(id)),
    ).toEqual([]);
  });
});

describe('IN-04…IN-06 SPI bands', () => {
  it('UT-IN-04-P SPI ≥ 1.00 → IN-04 green', () => {
    expect(find(generateInsights({ metrics: metricsFor(1, 1.1) }), 'IN-04')).toEqual({
      ruleId: 'IN-04',
      status: 'green',
      message: 'On or ahead of schedule: 110.00% of the planned work is done (SPI 1.10).',
    });
  });

  it('UT-IN-04-F SPI < 1.00 → no IN-04', () => {
    expect(find(generateInsights({ metrics: metricsFor(1, 0.99) }), 'IN-04')).toBeUndefined();
  });

  it('UT-IN-05-P 0.90 ≤ SPI < 1.00 → IN-05 amber', () => {
    expect(find(generateInsights({ metrics: metricsFor(1, 0.95) }), 'IN-05')).toMatchObject({
      status: 'amber',
      message: 'Slightly behind schedule: only 95.00% of the planned work is done (SPI 0.95).',
    });
  });

  it('UT-IN-05-F SPI < 0.90 → no IN-05', () => {
    expect(find(generateInsights({ metrics: metricsFor(1, 0.85) }), 'IN-05')).toBeUndefined();
  });

  it('UT-IN-06-P SPI < 0.90 → IN-06 red', () => {
    expect(find(generateInsights({ metrics: metricsFor(1, 0.5) }), 'IN-06')).toMatchObject({
      status: 'red',
    });
  });

  it('UT-IN-06-F SPI ≥ 0.90 → no IN-06', () => {
    expect(SPI_090.spi).toBe(0.9);
    expect(find(generateInsights({ metrics: SPI_090 }), 'IN-06')).toBeUndefined();
    expect(find(generateInsights({ metrics: SPI_090 }), 'IN-05')).toBeDefined();
  });
});

describe('IN-07, IN-08 combined CPI/SPI', () => {
  it('UT-IN-07-P CPI ≥ 1 and SPI < 1 → IN-07 info', () => {
    expect(find(generateInsights({ metrics: metricsFor(1.2, 0.8) }), 'IN-07')).toEqual({
      ruleId: 'IN-07',
      status: 'info',
      message: 'Low spending is due to slow progress, not efficiency (CPI 1.20, SPI 0.80).',
    });
  });

  it('UT-IN-07-F SPI ≥ 1 → no IN-07', () => {
    expect(find(generateInsights({ metrics: metricsFor(1.2, 1) }), 'IN-07')).toBeUndefined();
  });

  it('UT-IN-08-P CPI < 1 and SPI ≥ 1 → IN-08 info', () => {
    expect(find(generateInsights({ metrics: metricsFor(0.8, 1.1) }), 'IN-08')).toMatchObject({
      status: 'info',
      message: 'Schedule is being bought with extra cost (CPI 0.80, SPI 1.10).',
    });
  });

  it('UT-IN-08-F SPI < 1 → no IN-08', () => {
    expect(find(generateInsights({ metrics: metricsFor(0.8, 0.9) }), 'IN-08')).toBeUndefined();
  });
});

describe('IN-09 TCPI', () => {
  it('UT-IN-09-P TCPI > 1.10 → IN-09 red with TCPI and EAC', () => {
    // TCPI = (1000 − 400) / (1000 − 500) = 1.2; EAC = 1000 / 0.8 = 1250
    const metrics = computeMetricsFromTotals({ bac: 1000, pv: 400, ev: 400, ac: 500 });
    expect(find(generateInsights({ metrics, currency: 'USD' }), 'IN-09')).toEqual({
      ruleId: 'IN-09',
      status: 'red',
      message:
        'Recovering to budget is unrealistic: the remaining work would need a TCPI of 1.20 (more than 1.10). Consider re-baselining to the EAC of $1,250.00.',
    });
  });

  it('UT-IN-09-F TCPI exactly 1.10 → no IN-09', () => {
    const metrics = computeMetricsFromTotals({ bac: 1000, pv: 450, ev: 450, ac: 500 }); // 550 / 500
    expect(find(generateInsights({ metrics }), 'IN-09')).toBeUndefined();
  });
});

describe('IN-10 VAC', () => {
  it('UT-IN-10-P VAC < 0: red when the overrun is ≥ 10%, amber when smaller', () => {
    const red = find(generateInsights({ metrics: metricsFor(0.8, 1), currency: 'USD' }), 'IN-10');
    expect(red).toEqual({
      ruleId: 'IN-10',
      status: 'red',
      message: 'Forecast overrun of $250.00 (25.00%) at completion.',
    });
    const amber = find(generateInsights({ metrics: metricsFor(0.96, 1) }), 'IN-10');
    expect(amber).toMatchObject({
      status: 'amber',
      message: 'Forecast overrun of 41.67 (4.17%) at completion.',
    });
  });

  it('UT-IN-10-F VAC ≥ 0 → no IN-10', () => {
    expect(find(generateInsights({ metrics: metricsFor(1, 1) }), 'IN-10')).toBeUndefined();
    expect(find(generateInsights({ metrics: metricsFor(1.25, 1) }), 'IN-10')).toBeUndefined();
  });
});

describe('IN-11 CPI trend', () => {
  const snap = (date: string, cpi: number): StatusSnapshot => ({
    date,
    pv: 100,
    ev: 100 * cpi,
    ac: 100,
  });

  it('UT-IN-11-P CPI fell in each of the last 3 snapshot steps → IN-11 amber', () => {
    const snapshots = [
      snap('2026-04-30', 0.85),
      snap('2026-01-31', 1.05),
      snap('2026-03-31', 0.95),
      snap('2026-02-28', 1),
    ];
    const insight = find(generateInsights({ metrics: metricsFor(0.85, 1), snapshots }), 'IN-11');
    expect(insight).toEqual({
      ruleId: 'IN-11',
      status: 'amber',
      message:
        'Cost efficiency is trending down: CPI fell for 3 consecutive snapshots (1.05 → 1.00 → 0.95 → 0.85).',
    });
  });

  it('UT-IN-11-F too few snapshots, a rise, a flat step or a missing CPI → no IN-11', () => {
    const metrics = metricsFor(1, 1);
    const run = (cpis: number[]) =>
      find(
        generateInsights({ metrics, snapshots: cpis.map((c, i) => snap(`2026-0${i + 1}-01`, c)) }),
        'IN-11',
      );
    expect(run([1.0, 0.95, 0.9])).toBeUndefined(); // only 2 steps
    expect(run([1.0, 0.95, 0.97, 0.9])).toBeUndefined(); // a rise
    expect(run([1.0, 0.95, 0.95, 0.9])).toBeUndefined(); // flat
    const zeroAc = [
      snap('2026-01-01', 1),
      { date: '2026-02-01', pv: 1, ev: 1, ac: 0 },
      snap('2026-03-01', 0.9),
      snap('2026-04-01', 0.8),
    ];
    expect(fallingCpiRun(zeroAc, 3)).toBeNull();
    expect(fallingCpiRun([snap('2026-01-01', 1)], 0)).toBeNull();
  });
});

describe('IN-12 top overrun contributors', () => {
  const tm = (taskId: string, cv: number | null): TaskMetrics => ({
    taskId,
    estimatedCost: 0,
    actualCost: 0,
    variance: 0,
    variancePercent: 0,
    pv: 0,
    ev: 0,
    cv,
    sv: 0,
    cpi: null,
    spi: null,
  });

  it('UT-IN-12-P names the 3 tasks with the most negative CV, worst first', () => {
    const taskMetrics = [
      tm('A', -100),
      tm('B', 50),
      tm('C', -400),
      tm('D', -250),
      tm('E', -10),
      tm('F', null),
    ];
    const tasks = [
      { id: 'C', name: 'Electrical' },
      { id: 'D', name: 'Plumbing' },
    ];
    expect(
      find(
        generateInsights({ metrics: metricsFor(0.8, 1), taskMetrics, tasks, currency: 'USD' }),
        'IN-12',
      ),
    ).toEqual({
      ruleId: 'IN-12',
      status: 'info',
      message:
        'Main contributors to overrun: C Electrical (CV -$400.00), D Plumbing (CV -$250.00), A (CV -$100.00).',
    });
    expect(topOverrunTasks(taskMetrics, 0)).toEqual([]);
  });

  it('UT-IN-12-F no task has a negative CV → no IN-12', () => {
    const taskMetrics = [tm('A', 0), tm('B', 50), tm('C', null)];
    expect(
      find(generateInsights({ metrics: metricsFor(1, 1), taskMetrics }), 'IN-12'),
    ).toBeUndefined();
  });
});

describe('thresholds can be overridden', () => {
  it('UT-IN-13 a custom warning band changes the result', () => {
    const metrics = metricsFor(0.85, 1);
    expect(find(generateInsights({ metrics }), 'IN-03')).toBeDefined();
    const lenient = generateInsights({ metrics, thresholds: { indexWarning: 0.8 } });
    expect(find(lenient, 'IN-02')).toBeDefined();
    expect(find(lenient, 'IN-03')).toBeUndefined();
  });
});

describe('overall health (FR-27)', () => {
  const insight = (status: Insight['status']): Insight => ({ ruleId: 'X', status, message: '' });

  it('UT-IN-14 is the worst non-info status; null when nothing could be assessed', () => {
    expect(overallHealth([insight('green'), insight('amber'), insight('red')])).toBe('red');
    expect(overallHealth([insight('green'), insight('amber'), insight('info')])).toBe('amber');
    expect(overallHealth([insight('green'), insight('info')])).toBe('green');
    expect(overallHealth([insight('info')])).toBeNull();
    expect(overallHealth([])).toBeNull();
  });

  it('UT-IN-15 end to end: healthy and troubled projects', () => {
    expect(overallHealth(generateInsights({ metrics: metricsFor(1.1, 1.05) }))).toBe('green');
    expect(overallHealth(generateInsights({ metrics: metricsFor(1.0, 0.95) }))).toBe('amber');
    expect(overallHealth(generateInsights({ metrics: metricsFor(0.8, 0.8) }))).toBe('red');
    expect(
      overallHealth(
        generateInsights({ metrics: computeMetricsFromTotals({ bac: 0, pv: 0, ev: 0, ac: 0 }) }),
      ),
    ).toBeNull();
  });
});
