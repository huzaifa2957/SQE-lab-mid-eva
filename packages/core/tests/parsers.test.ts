import { describe, expect, it } from 'vitest';
import {
  type ColumnSpec,
  isBlank,
  looksLikeFormula,
  looksLikeFractions,
  mapHeaders,
  normalizeHeader,
  parseDate,
  parseNumber,
  parsePercent,
  sanitizeText,
} from '../src';

// Built from char codes so no invisible characters live in this source file.
const BOM = String.fromCharCode(0xfeff);
const BELL = String.fromCharCode(0x07);
const NUL = String.fromCharCode(0x00);
const RLO = String.fromCharCode(0x202e); // right-to-left override

const value = <T>(result: { ok: true; value: T } | { ok: false; reason: string }) =>
  result.ok ? result.value : `FAIL: ${result.reason}`;

describe('parseNumber (VR-06)', () => {
  it('UT-PAR-01 accepts plain numbers and numeric strings', () => {
    expect(value(parseNumber(1200))).toBe(1200);
    expect(value(parseNumber('1200'))).toBe(1200);
    expect(value(parseNumber(' 1200.5 '))).toBe(1200.5);
    expect(value(parseNumber('.5'))).toBe(0.5);
    expect(value(parseNumber('0'))).toBe(0);
  });

  it('UT-PAR-02 accepts thousands separators and currency symbols/codes', () => {
    expect(value(parseNumber('1,200'))).toBe(1200);
    expect(value(parseNumber('Rs 1200'))).toBe(1200);
    expect(value(parseNumber('Rs. 1,200'))).toBe(1200);
    expect(value(parseNumber('$1,200.50'))).toBe(1200.5);
    expect(value(parseNumber('PKR 1,234,567'))).toBe(1234567);
    expect(value(parseNumber('1200 USD'))).toBe(1200);
    expect(value(parseNumber('€99'))).toBe(99);
  });

  it('UT-PAR-03 keeps negative values (range checks happen in validation)', () => {
    expect(value(parseNumber('-500'))).toBe(-500);
    expect(value(parseNumber('-$1,200'))).toBe(-1200);
    expect(value(parseNumber('$-1,200'))).toBe(-1200);
    expect(value(parseNumber('(500)'))).toBe(-500);
    expect(value(parseNumber('-0'))).toBe(0);
  });

  it('UT-PAR-04 rejects text and malformed numbers', () => {
    for (const bad of [
      'abc',
      '12abc',
      '1,20',
      '1.2.3',
      '1e5',
      '$',
      '--5',
      '(-5)',
      '-$-5',
      'Rs',
      'one thousand',
    ]) {
      expect(parseNumber(bad), bad).toEqual({ ok: false, reason: 'is not a valid number' });
    }
    expect(parseNumber(Number.NaN).ok).toBe(false);
    expect(parseNumber(Infinity).ok).toBe(false);
    expect(parseNumber(true).ok).toBe(false);
    expect(parseNumber({}).ok).toBe(false);
  });

  it('UT-PAR-05 reports blank cells as required', () => {
    expect(parseNumber('')).toEqual({ ok: false, reason: 'is required' });
    expect(parseNumber('   ')).toEqual({ ok: false, reason: 'is required' });
  });
});

describe('parsePercent (VR-07)', () => {
  it('UT-PAR-06 accepts "45%", 45, "45" and 0.45', () => {
    expect(value(parsePercent('45%'))).toEqual({ value: 45, hadPercentSign: true });
    expect(value(parsePercent(' 45.5 % '))).toEqual({ value: 45.5, hadPercentSign: true });
    expect(value(parsePercent(45))).toEqual({ value: 45, hadPercentSign: false });
    expect(value(parsePercent('45'))).toEqual({ value: 45, hadPercentSign: false });
    expect(value(parsePercent(0.45))).toEqual({ value: 0.45, hadPercentSign: false });
  });

  it('UT-PAR-07 rejects non-numeric percentages', () => {
    expect(parsePercent('half').ok).toBe(false);
    expect(parsePercent('%').ok).toBe(false);
    expect(parsePercent('').ok).toBe(false);
  });

  it('UT-PAR-08 flags a column that looks like fractions', () => {
    const p = (v: number, sign = false) => ({ value: v, hadPercentSign: sign });
    expect(looksLikeFractions([p(0.45), p(1), p(0)])).toBe(true);
    expect(looksLikeFractions([p(0.45), p(45)])).toBe(false); // a value above 1
    expect(looksLikeFractions([p(0.5), p(1, true)])).toBe(false); // explicit % sign
    expect(looksLikeFractions([p(0), p(0)])).toBe(false); // all zero is not suspicious
    expect(looksLikeFractions([])).toBe(false);
  });
});

describe('parseDate (VR-08)', () => {
  it('UT-PAR-09 accepts YYYY-MM-DD (with or without time)', () => {
    expect(value(parseDate('2026-03-11'))).toBe('2026-03-11');
    expect(value(parseDate('2026-3-1'))).toBe('2026-03-01');
    expect(value(parseDate('2026-03-11T10:30:00Z'))).toBe('2026-03-11');
    expect(value(parseDate(' 2024-02-29 '))).toBe('2024-02-29');
  });

  it('UT-PAR-10 accepts DD/MM/YYYY (also with - or .)', () => {
    expect(value(parseDate('11/03/2026'))).toBe('2026-03-11');
    expect(value(parseDate('1/3/2026'))).toBe('2026-03-01');
    expect(value(parseDate('11-03-2026'))).toBe('2026-03-11');
    expect(value(parseDate('11.03.2026'))).toBe('2026-03-11');
    expect(value(parseDate('31/12/2026'))).toBe('2026-12-31');
  });

  it('UT-PAR-11 accepts Excel serial numbers and Date objects', () => {
    expect(value(parseDate(46092))).toBe('2026-03-11');
    expect(value(parseDate('46092'))).toBe('2026-03-11');
    expect(value(parseDate(46092.75))).toBe('2026-03-11'); // time part ignored
    expect(value(parseDate(61))).toBe('1900-03-01');
    expect(value(parseDate(new Date(Date.UTC(2026, 2, 11))))).toBe('2026-03-11');
  });

  it('UT-PAR-12 rejects impossible, ambiguous and out-of-range dates', () => {
    for (const bad of [
      '2026-02-30',
      '30/02/2026',
      '13/13/2026',
      'next week',
      '2026/03/11',
      '03-2026',
    ]) {
      expect(parseDate(bad).ok, bad).toBe(false);
    }
    expect(parseDate(60).ok).toBe(false); // before Excel's 1900 leap-year bug is resolved
    expect(parseDate(3_000_000).ok).toBe(false);
    expect(parseDate(Number.NaN).ok).toBe(false);
    expect(parseDate(new Date('invalid')).ok).toBe(false);
    expect(parseDate(true).ok).toBe(false);
    expect(parseDate('')).toEqual({ ok: false, reason: 'is required' });
  });
});

describe('header mapping (FR-06)', () => {
  type F = 'actualCost' | 'percent' | 'name';
  const specs: ColumnSpec<F>[] = [
    { field: 'actualCost', label: 'Actual Cost', required: true, aliases: ['AC'] },
    { field: 'percent', label: '% Complete', required: true },
    { field: 'name', label: 'Task Name', required: false },
  ];

  it('UT-PAR-13 normalises case, spaces, underscores, hyphens and BOM', () => {
    expect(normalizeHeader('Actual Cost')).toBe('actualcost');
    expect(normalizeHeader('actual_cost')).toBe('actualcost');
    expect(normalizeHeader(' ACTUAL-COST ')).toBe('actualcost');
    expect(normalizeHeader('% complete')).toBe('%complete');
    expect(normalizeHeader(`${BOM}Task ID`)).toBe('taskid');
  });

  it('UT-PAR-14 maps headers to fields and reports missing, duplicate and unknown columns', () => {
    const mapping = mapHeaders(['actual_cost', 'Notes', '', 'AC'], specs);
    expect(mapping.columns).toEqual({ actualCost: 0 });
    expect(mapping.headers).toEqual({ actualCost: 'actual_cost' });
    expect(mapping.missing.map((s) => s.label)).toEqual(['% Complete']);
    expect(mapping.duplicates).toEqual(['AC']);
    expect(mapping.unknown).toEqual(['Notes']);
  });

  it('UT-PAR-15 accepts every alias spelling', () => {
    expect(mapHeaders(['ac', '%_COMPLETE'], specs).missing).toEqual([]);
  });
});

describe('sanitizeText (VR-16)', () => {
  it('UT-PAR-16 trims, collapses whitespace and removes control characters', () => {
    expect(sanitizeText('  Design  ')).toEqual({
      value: 'Design',
      changed: false,
      truncated: false,
    });
    expect(sanitizeText(`Des${BELL}ign${NUL}`)).toEqual({
      value: 'Design',
      changed: true,
      truncated: false,
    });
    expect(sanitizeText('Line one\r\nLine\ttwo').value).toBe('Line one Line two');
    expect(sanitizeText(`abc${RLO}def`).value).toBe('abcdef');
    expect(sanitizeText(null).value).toBe('');
    expect(sanitizeText(42).value).toBe('42');
  });

  it('UT-PAR-17 limits length', () => {
    expect(sanitizeText('abcdef', 3)).toEqual({ value: 'abc', changed: false, truncated: true });
    expect(sanitizeText('abc', 3).truncated).toBe(false);
  });

  it('UT-PAR-18 keeps HTML and formulas as literal text, and detects formula prefixes', () => {
    expect(sanitizeText('<b>bold</b>').value).toBe('<b>bold</b>');
    for (const formula of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\t=1', '  =1']) {
      expect(looksLikeFormula(formula), formula).toBe(true);
    }
    for (const text of ['Design', '1-2', 'a=b', '', 5]) expect(looksLikeFormula(text)).toBe(false);
  });

  it('UT-PAR-19 isBlank', () => {
    expect(isBlank('')).toBe(true);
    expect(isBlank('  ')).toBe(true);
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank(0)).toBe(false);
    expect(isBlank('x')).toBe(false);
  });
});
