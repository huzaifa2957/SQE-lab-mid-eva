// Full worked example — every expected value below is hand-calculated in
// docs/test-cases.md §2.

import { describe, expect, it } from 'vitest';
import { computeProjectMetrics, computeTaskMetrics, formatCurrency, formatIndex } from '../src';
import { workedProject, workedTasks } from './fixtures/worked-example';

const statusDate = workedProject.statusDate;

describe('Worked example (docs/test-cases.md §2)', () => {
  it('UT-WE-01 task-level metrics match the hand calculation', () => {
    const expected = {
      //   variance  var%   PV      EV      CV      SV      CPI      SPI
      T1: [-2_000, -20, 10_000, 10_000, -2_000, 0, 10 / 12, 1],
      T2: [10_000, 50, 10_000, 8_000, -2_000, -2_000, 0.8, 0.8],
      T3: [28_000, 70, 10_000, 8_000, -4_000, -2_000, 8 / 12, 0.8],
      T4: [20_000, 100, 0, 0, 0, 0, null, null],
      T5: [4_000, 40, 10_000, 6_000, 0, -4_000, 1, 0.6],
    } as const;

    for (const task of workedTasks) {
      const m = computeTaskMetrics(task, statusDate);
      const [variance, variancePercent, pv, ev, cv, sv, cpi, spi] =
        expected[task.id as keyof typeof expected];
      expect(m.estimatedCost, task.id).toBe(task.budget);
      expect(m.actualCost, task.id).toBe(task.actualCost);
      expect(m.variance, task.id).toBe(variance);
      expect(m.variancePercent, task.id).toBe(variancePercent);
      expect(m.pv, task.id).toBe(pv);
      expect(m.ev, task.id).toBe(ev);
      expect(m.cv, task.id).toBe(cv);
      expect(m.sv, task.id).toBe(sv);
      if (cpi === null) expect(m.cpi, task.id).toBeNull();
      else expect(m.cpi, task.id).toBeCloseTo(cpi, 12);
      if (spi === null) expect(m.spi, task.id).toBeNull();
      else expect(m.spi, task.id).toBeCloseTo(spi, 12);
    }
  });

  it('UT-WE-02 project-level metrics match the hand calculation', () => {
    const m = computeProjectMetrics(workedTasks, statusDate);

    expect(m.bac).toBe(100_000);
    expect(m.pv).toBe(40_000);
    expect(m.ev).toBe(32_000);
    expect(m.ac).toBe(40_000);
    expect(m.variance).toBe(60_000);
    expect(m.variancePercent).toBe(60);
    expect(m.cv).toBe(-8_000);
    expect(m.sv).toBe(-8_000);
    expect(m.cvPercent).toBe(-25);
    expect(m.svPercent).toBe(-20);
    expect(m.cpi).toBe(0.8);
    expect(m.spi).toBe(0.8);
    expect(m.eac.typical).toBeCloseTo(125_000, 6);
    expect(m.eac.atypical).toBe(108_000);
    expect(m.eac.combined).toBeCloseTo(146_250, 6);
    expect(m.eacMethod).toBe('typical');
    expect(m.eacPrimary).toBeCloseTo(125_000, 6);
    expect(m.etc).toBeCloseTo(85_000, 6);
    expect(m.vac).toBeCloseTo(-25_000, 6);
    expect(m.vacPercent).toBeCloseTo(-25, 9);
    expect(m.tcpi).toBeCloseTo(68_000 / 60_000, 12);
    expect(m.percentComplete).toBe(32);
    expect(m.percentSpent).toBe(40);
  });

  it('UT-WE-03 displayed values match the rounded hand calculation', () => {
    const m = computeProjectMetrics(workedTasks, statusDate);
    expect(formatCurrency(m.eacPrimary, workedProject.currency)).toBe('$125,000.00');
    expect(formatCurrency(m.vac, workedProject.currency)).toBe('-$25,000.00');
    expect(formatIndex(m.tcpi)).toBe('1.13');
    expect(formatIndex(computeTaskMetrics(workedTasks[0]!, statusDate).cpi)).toBe('0.83');
    expect(formatIndex(computeTaskMetrics(workedTasks[3]!, statusDate).cpi)).toBe('N/A');
  });
});
