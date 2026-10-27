import { describe, expect, it } from 'vitest';
import { parseIsoDate, plannedFraction, plannedValue } from '../src';

const task = { budget: 1000, plannedStart: '2026-03-01', plannedFinish: '2026-03-11' }; // 10 days

describe('parseIsoDate', () => {
  it('UT-PV-01 parses valid ISO dates to UTC day numbers', () => {
    expect(parseIsoDate('1970-01-01')).toBe(0);
    expect(parseIsoDate('1970-01-02')).toBe(1);
    expect(parseIsoDate('2026-03-11T15:30:00Z')).toBe(parseIsoDate('2026-03-11'));
    expect(parseIsoDate('2024-02-29')).not.toBeNull(); // leap day
  });

  it('UT-PV-02 rejects malformed and impossible dates', () => {
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate('11/03/2026')).toBeNull();
    expect(parseIsoDate('2026-3-1')).toBeNull();
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2026-02-29')).toBeNull(); // not a leap year
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('2026-03-11x')).toBeNull();
  });
});

describe('plannedFraction / plannedValue (§4.1 PV)', () => {
  it('UT-PV-03 status date before start → 0', () => {
    expect(plannedFraction(task.plannedStart, task.plannedFinish, '2026-02-15')).toBe(0);
    expect(plannedValue(task, '2026-02-15')).toBe(0);
  });

  it('UT-PV-04 status date on start → 0', () => {
    expect(plannedValue(task, '2026-03-01')).toBe(0);
  });

  it('UT-PV-05 spreads budget linearly between start and finish', () => {
    expect(plannedFraction(task.plannedStart, task.plannedFinish, '2026-03-06')).toBe(0.5);
    expect(plannedValue(task, '2026-03-06')).toBe(500);
    expect(plannedValue(task, '2026-03-04')).toBe(300);
    // Unrounded: 1/3 of a 3-day task
    const short = { budget: 100, plannedStart: '2026-03-01', plannedFinish: '2026-03-04' };
    expect(plannedValue(short, '2026-03-02')).toBe(100 * (1 / 3));
  });

  it('UT-PV-06 status date on finish → full budget', () => {
    expect(plannedValue(task, '2026-03-11')).toBe(1000);
  });

  it('UT-PV-07 status date after finish → full budget (clamped)', () => {
    expect(plannedFraction(task.plannedStart, task.plannedFinish, '2027-01-01')).toBe(1);
    expect(plannedValue(task, '2027-01-01')).toBe(1000);
  });

  it('UT-PV-08 start = finish: 0 before the date', () => {
    const milestone = { budget: 500, plannedStart: '2026-03-05', plannedFinish: '2026-03-05' };
    expect(plannedValue(milestone, '2026-03-04')).toBe(0);
  });

  it('UT-PV-09 start = finish: full budget on and after the date', () => {
    const milestone = { budget: 500, plannedStart: '2026-03-05', plannedFinish: '2026-03-05' };
    expect(plannedValue(milestone, '2026-03-05')).toBe(500);
    expect(plannedValue(milestone, '2026-06-01')).toBe(500);
  });

  it('UT-PV-10 finish before start → null', () => {
    expect(plannedFraction('2026-03-11', '2026-03-01', '2026-03-05')).toBeNull();
    expect(plannedValue({ ...task, plannedFinish: '2026-02-01' }, '2026-03-05')).toBeNull();
  });

  it('UT-PV-11 invalid task or status dates → null', () => {
    expect(plannedValue({ ...task, plannedStart: 'soon' }, '2026-03-05')).toBeNull();
    expect(plannedValue({ ...task, plannedFinish: '2026-02-30' }, '2026-03-05')).toBeNull();
    expect(plannedValue(task, 'not a date')).toBeNull();
  });

  it('UT-PV-12 zero budget → 0; non-finite budget → null', () => {
    expect(plannedValue({ ...task, budget: 0 }, '2026-03-06')).toBe(0);
    expect(plannedValue({ ...task, budget: Number.NaN }, '2026-03-06')).toBeNull();
    expect(plannedValue({ ...task, budget: Infinity }, '2026-03-06')).toBeNull();
    expect(plannedValue({ ...task, budget: Number.MAX_VALUE }, '2027-01-01')).toBe(
      Number.MAX_VALUE,
    );
  });
});
