import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANOMALY_THRESHOLDS,
  detectAnomalies,
  detectCompleteLowSpend,
  detectCostVarianceOutliers,
  detectOverBudgetIncomplete,
  detectProgressRegression,
  detectSpendingSpikes,
  detectSpendWithoutProgress,
  mean,
  median,
  quantile,
  type StatusSnapshot,
  standardDeviation,
  type Task,
} from '../src';

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  name: `Task ${id}`,
  category: 'Labour',
  budget: 1000,
  plannedStart: '2026-01-01',
  plannedFinish: '2026-01-31',
  percentComplete: 50,
  actualCost: 500,
  ...overrides,
});

/** Budget 1000 at 50% → EV 500, so CV% = (500 − AC) / 500 × 100. */
const withCvPercent = (id: string, cvPercent: number) =>
  task(id, { actualCost: 500 - (cvPercent / 100) * 500 });

const snap = (
  date: string,
  ac: number,
  taskStates?: StatusSnapshot['taskStates'],
): StatusSnapshot => ({
  date,
  pv: ac,
  ev: ac,
  ac,
  ...(taskStates ? { taskStates } : {}),
});

describe('statistics helpers', () => {
  it('UT-AN-00 mean, population SD, inclusive quantiles and median', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(quantile([-100, -5, 0, 2], 0.25)).toBe(-28.75);
    expect(quantile([-100, -5, 0, 2], 0.75)).toBe(0.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(Object.isFrozen(DEFAULT_ANOMALY_THRESHOLDS)).toBe(true);
  });
});

describe('AN-01 cost-variance % outliers', () => {
  it('UT-AN-01-P z-score rule (n ≥ 5) flags a task with |z| > 2', () => {
    const tasks = [0, 2, -5, -3, 1, -100].map((cv, i) => withCvPercent(`T${i + 1}`, cv));
    const anomalies = detectCostVarianceOutliers(tasks);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({ ruleId: 'AN-01', taskId: 'T6', severity: 'high' });
    expect(anomalies[0]!.message).toBe(
      'Task T6 has a cost variance of -100.00%, far from the other tasks (average -17.50%, z-score -2.23).',
    );
  });

  it('UT-AN-01-P2 IQR rule (n < 5) flags a value outside Q1 − 1.5·IQR … Q3 + 1.5·IQR', () => {
    const tasks = [0, 2, -5, -100].map((cv, i) => withCvPercent(`T${i + 1}`, cv));
    const anomalies = detectCostVarianceOutliers(tasks);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({ ruleId: 'AN-01', taskId: 'T4' });
    expect(anomalies[0]!.message).toBe(
      'Task T4 has a cost variance of -100.00%, outside the typical range of -72.63% to 44.38% (IQR rule).',
    );
    // A positive outlier is reported with low severity
    const positive = detectCostVarianceOutliers(
      [0, 2, -5, 300].map((cv, i) => withCvPercent(`T${i + 1}`, cv)),
    );
    expect(positive[0]).toMatchObject({ taskId: 'T4', severity: 'low' });
  });

  it('UT-AN-01-F no outlier when values are similar, identical or too few; EV = 0 tasks are skipped', () => {
    expect(
      detectCostVarianceOutliers([0, 2, -5, -3, 1, -8].map((cv, i) => withCvPercent(`T${i}`, cv))),
    ).toEqual([]);
    expect(
      detectCostVarianceOutliers([0, 2, -5, -3].map((cv, i) => withCvPercent(`T${i}`, cv))),
    ).toEqual([]);
    expect(
      detectCostVarianceOutliers([5, 5, 5, 5, 5].map((cv, i) => withCvPercent(`T${i}`, cv))),
    ).toEqual([]);
    expect(
      detectCostVarianceOutliers([0, -100].map((cv, i) => withCvPercent(`T${i}`, cv))),
    ).toEqual([]);
    // Four normal tasks plus a 0%-complete task: the latter has no CV%, so the IQR rule sees 4 values
    const withUnstarted = [
      ...[0, 2, -5, -3].map((cv, i) => withCvPercent(`T${i}`, cv)),
      task('X', { percentComplete: 0, actualCost: 9999 }),
    ];
    expect(detectCostVarianceOutliers(withUnstarted)).toEqual([]);
  });
});

describe('AN-02 spend with 0% progress', () => {
  it('UT-AN-02-P flags AC > 0 at 0% complete', () => {
    expect(
      detectSpendWithoutProgress([task('A', { percentComplete: 0, actualCost: 5000 })], 'USD'),
    ).toEqual([
      {
        ruleId: 'AN-02',
        severity: 'medium',
        taskId: 'A',
        message: 'Task A has spent $5,000.00 but is 0% complete.',
      },
    ]);
  });

  it('UT-AN-02-F no flag when nothing is spent or progress is reported', () => {
    expect(
      detectSpendWithoutProgress([
        task('A', { percentComplete: 0, actualCost: 0 }),
        task('B', { percentComplete: 1 }),
      ]),
    ).toEqual([]);
  });
});

describe('AN-03 over budget before completion', () => {
  it('UT-AN-03-P flags AC > budget while < 100% complete', () => {
    const [anomaly] = detectOverBudgetIncomplete([
      task('A', { actualCost: 1200, percentComplete: 60 }),
    ]);
    expect(anomaly).toEqual({
      ruleId: 'AN-03',
      severity: 'high',
      taskId: 'A',
      message:
        'Task A has spent 1,200.00, more than its budget of 1,000.00, but is only 60.00% complete.',
    });
  });

  it('UT-AN-03-F no flag when finished, or AC ≤ budget', () => {
    expect(
      detectOverBudgetIncomplete([
        task('A', { actualCost: 1200, percentComplete: 100 }),
        task('B', { actualCost: 1000, percentComplete: 60 }),
      ]),
    ).toEqual([]);
  });
});

describe('AN-04 spending spikes', () => {
  it('UT-AN-04-P flags a period AC increase > 2× the median increase', () => {
    const snapshots = [
      snap('2026-01-31', 0),
      snap('2026-02-28', 100),
      snap('2026-04-30', 900),
      snap('2026-03-31', 200),
      snap('2026-03-15', 150),
    ];
    // sorted increases: 100, 50, 50, 700 → median 75 → 700 > 150
    expect(detectSpendingSpikes(snapshots, DEFAULT_ANOMALY_THRESHOLDS, 'USD')).toEqual([
      {
        ruleId: 'AN-04',
        severity: 'medium',
        snapshotDate: '2026-04-30',
        message:
          'Actual cost rose by $700.00 between 2026-03-31 and 2026-04-30, more than 2× the median period increase of $75.00.',
      },
    ]);
  });

  it('UT-AN-04-F no flag for steady spending, too few periods, or no spending', () => {
    expect(
      detectSpendingSpikes([0, 100, 210, 300, 390].map((ac, i) => snap(`2026-0${i + 1}-01`, ac))),
    ).toEqual([]);
    expect(
      detectSpendingSpikes([0, 100, 900].map((ac, i) => snap(`2026-0${i + 1}-01`, ac))),
    ).toEqual([]); // 2 periods
    expect(
      detectSpendingSpikes([0, 0, 0, 0, 50].map((ac, i) => snap(`2026-0${i + 1}-01`, ac))),
    ).toEqual([]); // median 0
    // exactly 2× is not a spike
    expect(
      detectSpendingSpikes([0, 100, 200, 300, 500].map((ac, i) => snap(`2026-0${i + 1}-01`, ac))),
    ).toEqual([]);
  });
});

describe('AN-05 % complete decreased', () => {
  const state = (taskId: string, percentComplete: number) => ({
    taskId,
    percentComplete,
    actualCost: 0,
  });

  it('UT-AN-05-P flags a task whose % complete went down between snapshots', () => {
    const snapshots = [
      snap('2026-02-28', 20, [state('A', 60), state('B', 10)]),
      snap('2026-01-31', 10, [state('A', 40), state('B', 10)]),
      snap('2026-03-31', 30, [state('A', 50), state('B', 30)]),
    ];
    expect(detectProgressRegression(snapshots)).toEqual([
      {
        ruleId: 'AN-05',
        severity: 'high',
        taskId: 'A',
        snapshotDate: '2026-03-31',
        message:
          'Task A % complete went down from 60.00% to 50.00% between 2026-02-28 and 2026-03-31.',
      },
    ]);
  });

  it('UT-AN-05-F no flag when progress only rises, tasks are new, or states are missing', () => {
    expect(
      detectProgressRegression([
        snap('2026-01-31', 10, [state('A', 40)]),
        snap('2026-02-28', 20, [state('A', 40), state('B', 5)]),
        snap('2026-03-31', 30),
        snap('2026-04-30', 40, [state('A', 10)]), // previous snapshot had no states
      ]),
    ).toEqual([]);
  });
});

describe('AN-06 complete but under-spent', () => {
  it('UT-AN-06-P flags 100% complete with AC < 50% of budget', () => {
    expect(detectCompleteLowSpend([task('A', { percentComplete: 100, actualCost: 400 })])).toEqual([
      {
        ruleId: 'AN-06',
        severity: 'low',
        taskId: 'A',
        message:
          'Task A is 100% complete but has spent only 400.00 (40.00% of its 1,000.00 budget). Check for missing invoices.',
      },
    ]);
  });

  it('UT-AN-06-F no flag at exactly 50%, below 100% complete, or zero budget', () => {
    expect(
      detectCompleteLowSpend([
        task('A', { percentComplete: 100, actualCost: 500 }),
        task('B', { percentComplete: 99, actualCost: 0 }),
        task('C', { percentComplete: 100, actualCost: 0, budget: 0 }),
      ]),
    ).toEqual([]);
  });
});

describe('detectAnomalies', () => {
  it('UT-AN-07 runs every rule in rule order and applies threshold overrides', () => {
    const tasks = [
      task('A', { percentComplete: 0, actualCost: 100 }), // AN-02
      task('B', { percentComplete: 50, actualCost: 1500 }), // AN-03 (+ AN-01 candidate)
      task('C', { percentComplete: 100, actualCost: 100 }), // AN-06 (+ AN-01 candidate)
    ];
    const snapshots = [
      snap('2026-01-01', 0),
      snap('2026-02-01', 10),
      snap('2026-03-01', 20),
      snap('2026-04-01', 100),
    ];
    const all = detectAnomalies({ tasks, snapshots, currency: 'USD' });
    expect(all.map((a) => a.ruleId)).toEqual(['AN-02', 'AN-03', 'AN-04', 'AN-06']);

    const strict = detectAnomalies({ tasks, thresholds: { lowSpendRatio: 0.05 } });
    expect(strict.map((a) => a.ruleId)).toEqual(['AN-02', 'AN-03']);
  });

  it('UT-AN-08 clean data has no anomalies', () => {
    expect(detectAnomalies({ tasks: [task('A'), task('B'), task('C')] })).toEqual([]);
  });
});
