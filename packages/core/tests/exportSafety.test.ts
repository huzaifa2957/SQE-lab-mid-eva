// SR-04 formula-injection escaping, CSV serialisation (FR-42) and report file names (FR-43).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  escapeSpreadsheetCell,
  importTasksCsv,
  MAX_FILE_STEM,
  parseCsv,
  reportFileName,
  toCsv,
  UTF8_BOM,
} from '../src';

const injectionCsv = readFileSync(
  new URL('../../../samples/invalid_formula_injection.csv', import.meta.url),
  'utf8',
);

describe('escapeSpreadsheetCell (SR-04)', () => {
  it('UT-SR04-01-F prefixes text starting with = + - @ tab or CR with a single quote', () => {
    for (const text of ['=1+1', '+SUM(A1)', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd']) {
      expect(escapeSpreadsheetCell(text)).toBe(`'${text}`);
    }
  });

  it('UT-SR04-01-P leaves safe text, numbers, booleans and empty cells unchanged', () => {
    expect(escapeSpreadsheetCell('Design')).toBe('Design');
    expect(escapeSpreadsheetCell('a=b')).toBe('a=b');
    expect(escapeSpreadsheetCell(' =1')).toBe(' =1');
    expect(escapeSpreadsheetCell('')).toBe('');
    expect(escapeSpreadsheetCell(-2000)).toBe(-2000);
    expect(escapeSpreadsheetCell(0)).toBe(0);
    expect(escapeSpreadsheetCell(true)).toBe(true);
    expect(escapeSpreadsheetCell(null)).toBeNull();
    expect(escapeSpreadsheetCell(undefined)).toBeUndefined();
  });

  it('UT-SR04-02 every task name in invalid_formula_injection.csv is neutralised', () => {
    const { tasks } = importTasksCsv(injectionCsv);
    const names = tasks.map((t) => t.name);
    expect(names).toHaveLength(5);
    const escaped = names.map((n) => escapeSpreadsheetCell(n));
    expect(escaped.slice(0, 4).every((n) => n.startsWith("'"))).toBe(true);
    // HTML is not a spreadsheet formula: kept as literal text
    expect(escaped[4]).toBe("<script>alert('xss')</script>");
  });
});

describe('toCsv (FR-42, SR-04)', () => {
  it('UT-CSV-01 writes a BOM, CRLF lines, quoted text and plain numbers', () => {
    const csv = toCsv([
      ['Task ID', 'Name', 'Budget'],
      ['1.1', 'Walls, doors and "trim"', 1200.5],
      ['1.2', 'Line\nbreak', -300],
      ['1.3', null, Number.NaN],
    ]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Task ID,Name,Budget',
      '1.1,"Walls, doors and ""trim""",1200.5',
      '1.2,"Line\nbreak",-300',
      '1.3,,',
      '',
    ]);
    expect(toCsv([['a']], { bom: false })).toBe('a\r\n');
  });

  it('UT-CSV-02 formula text is escaped, and the CSV reads back as the same literal text', () => {
    const { tasks } = importTasksCsv(injectionCsv);
    const csv = toCsv([['Name', 'Budget'], ...tasks.map((t) => [t.name, t.budget])]);
    const parsed = parseCsv(csv.slice(1));
    const column = parsed.sheet.rows.map((row) => String(row[0] ?? '')).filter(Boolean);
    expect(column).toEqual(tasks.map((t) => escapeSpreadsheetCell(t.name)));
    expect(column.filter((v) => /^[=+\-@]/.test(v))).toEqual([]);
    expect(csv).toContain(`"'=HYPERLINK(""http://example.invalid"",""Click me"")"`);
    // numbers are not escaped even when negative
    expect(toCsv([[-5]], { bom: false })).toBe('-5\r\n');
  });
});

describe('reportFileName (FR-43)', () => {
  it('UT-FN-01-P builds EVM_<project>_<statusDate>.<ext>', () => {
    expect(reportFileName('Office Fit-out', '2026-04-03', 'pdf')).toBe(
      'EVM_Office_Fit_out_2026-04-03.pdf',
    );
    expect(reportFileName('Clinic: Phase 2', '2026-04-03', '.XLSX')).toBe(
      'EVM_Clinic_Phase_2_2026-04-03.xlsx',
    );
  });

  it('UT-FN-01-F removes Windows-invalid characters and path parts; keeps the stem ≤ 80', () => {
    const name = reportFileName('a<b>c:d"e/f\\g|h?i*j  k', '2026-04-03', 'csv');
    expect(name).toBe('EVM_abcdefghij_k_2026-04-03.csv');
    expect(name).not.toMatch(/[<>:"/\\|?*\s]/);
    expect(reportFileName('../../etc/passwd', '2026-04-03', 'pdf')).toBe(
      'EVM_etcpasswd_2026-04-03.pdf',
    );
    const long = reportFileName('x'.repeat(200), '2026-04-03', 'pdf');
    expect(long.replace(/\.pdf$/, '').length).toBe(MAX_FILE_STEM);
    expect(long.endsWith('_2026-04-03.pdf')).toBe(true);
    expect(reportFileName('***', '', 'exe!')).toBe('EVM_project_undated.exe');
  });
});
