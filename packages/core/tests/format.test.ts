import { describe, expect, it } from 'vitest';
import { formatCurrency, formatIndex, formatNumber, formatPercent, NOT_AVAILABLE } from '../src';

describe('format.ts', () => {
  it('UT-FMT-01 currency to 2 dp with grouping and sign', () => {
    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatCurrency(-2000, 'USD')).toBe('-$2,000.00');
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
    expect(formatCurrency(1234.567, 'USD')).toBe('$1,234.57');
  });

  it('UT-FMT-02 other ISO currencies and invalid codes', () => {
    expect(formatCurrency(1234.5, 'PKR')).toMatch(/^PKR\s1,234\.50$/);
    expect(formatCurrency(1234.5, 'not-a-code')).toBe('not-a-code 1,234.50');
  });

  it('UT-FMT-03 percentages to 2 dp', () => {
    expect(formatPercent(-25)).toBe('-25.00%');
    expect(formatPercent(12.345678)).toBe('12.35%');
    expect(formatPercent(100)).toBe('100.00%');
  });

  it('UT-FMT-04 indices to 2 dp', () => {
    expect(formatIndex(0.8)).toBe('0.80');
    expect(formatIndex(1 / 3)).toBe('0.33');
    expect(formatIndex(68 / 60)).toBe('1.13');
    expect(formatNumber(1234.5678, 0)).toBe('1,235');
  });

  it('UT-FMT-05 null, undefined, NaN and Infinity display as "N/A"', () => {
    for (const value of [null, undefined, Number.NaN, Infinity, -Infinity]) {
      expect(formatCurrency(value, 'USD')).toBe(NOT_AVAILABLE);
      expect(formatPercent(value)).toBe(NOT_AVAILABLE);
      expect(formatIndex(value)).toBe(NOT_AVAILABLE);
      expect(formatNumber(value)).toBe(NOT_AVAILABLE);
    }
    expect(NOT_AVAILABLE).toBe('N/A');
  });

  it('UT-FMT-06 tiny negatives never display as "-0.00"', () => {
    expect(formatCurrency(-0.001, 'USD')).toBe('$0.00');
    expect(formatPercent(-0.004)).toBe('0.00%');
    expect(formatIndex(-0)).toBe('0.00');
    expect(formatNumber(-0.4, 0)).toBe('0');
    expect(formatCurrency(-0.006, 'USD')).toBe('-$0.01');
  });

  it('UT-FMT-07 rounding happens only in the formatted string', () => {
    const value = 2 / 3;
    expect(formatIndex(value)).toBe('0.67');
    expect(value).toBe(2 / 3); // input untouched
  });
});
