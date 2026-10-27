// Every file in samples/ produces the result documented in samples/README.md.

import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  computeProjectMetrics,
  computeTaskMetrics,
  detectAnomalies,
  generateInsights,
  importPeriodsCsv,
  importTasksCsv,
  overallHealth,
  parseCsv,
  parseProjectRecord,
  type ValidationIssue,
  validateFileMeta,
} from '../src';

const samplesDir = new URL('../../../samples/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, samplesDir), 'utf8');
const meta = (name: string) => ({ name, size: statSync(new URL(name, samplesDir)).size, type: '' });
const summary = (issues: ValidationIssue[]) => issues.map((i) => [i.ruleId, i.row ?? null]);

function loadSampleProject() {
  const { sheet } = parseCsv(read('sample_project_info.csv'));
  const record = Object.fromEntries(sheet.headers.map((h, i) => [String(h), sheet.rows[0]![i]]));
  const info = parseProjectRecord(record);
  const tasks = importTasksCsv(read('sample_project.csv'), { project: info.project! });
  const periods = importPeriodsCsv(read('sample_periods.csv'));
  return { info, tasks, periods };
}

describe('valid samples', () => {
  it('UT-SMP-01 sample project info, tasks and periods import cleanly', () => {
    const { info, tasks, periods } = loadSampleProject();
    expect(info.valid).toBe(true);
    expect(info.project).toEqual({
      name: 'Clinic Building Extension',
      currency: 'PKR',
      startDate: '2026-01-05',
      endDate: '2026-06-26',
      statusDate: '2026-04-03',
    });

    expect(tasks.valid).toBe(true);
    expect(tasks.tasks).toHaveLength(12);
    expect(summary(tasks.warnings)).toEqual([['VR-12', 10]]); // 3.2 spent with 0% complete

    expect(periods.valid).toBe(true);
    expect(periods.warnings).toEqual([]);
    expect(periods.snapshots).toHaveLength(6);

    for (const name of ['sample_project.csv', 'sample_periods.csv', 'sample_project_info.csv']) {
      expect(validateFileMeta(meta(name)).valid, name).toBe(true);
    }
  });

  it('UT-SMP-02 the last snapshot equals the task totals at the status date', () => {
    const { info, tasks, periods } = loadSampleProject();
    const metrics = computeProjectMetrics(tasks.tasks, info.project!.statusDate);
    const last = periods.snapshots.at(-1)!;
    expect(last.date).toBe(info.project!.statusDate);
    expect(metrics.bac).toBe(1_040_000);
    expect(metrics.ev).toBe(last.ev);
    expect(metrics.ac).toBe(last.ac);
    expect(metrics.pv).toBeCloseTo(last.pv, 1);
  });

  it('UT-SMP-03 the sample project triggers the documented insights and anomalies', () => {
    const { info, tasks, periods } = loadSampleProject();
    const statusDate = info.project!.statusDate;
    const metrics = computeProjectMetrics(tasks.tasks, statusDate);
    const insights = generateInsights({
      metrics,
      taskMetrics: tasks.tasks.map((t) => computeTaskMetrics(t, statusDate)),
      tasks: tasks.tasks,
      snapshots: periods.snapshots,
      currency: info.project!.currency,
    });
    expect(insights.map((i) => [i.ruleId, i.status])).toEqual([
      ['IN-03', 'red'],
      ['IN-05', 'amber'],
      ['IN-09', 'red'],
      ['IN-10', 'red'],
      ['IN-11', 'amber'],
      ['IN-12', 'info'],
    ]);
    expect(overallHealth(insights)).toBe('red');

    const anomalies = detectAnomalies({ tasks: tasks.tasks, snapshots: periods.snapshots });
    expect(anomalies.map((a) => [a.ruleId, a.taskId ?? a.snapshotDate])).toEqual([
      ['AN-01', '3.1'],
      ['AN-02', '3.2'],
    ]);
  });

  it('UT-SMP-04 the template has the required headers but no data rows', () => {
    const result = importTasksCsv(read('tasks_template.csv'));
    expect(result.mapping.missing).toEqual([]);
    expect(summary(result.errors)).toEqual([['VR-15', null]]);
  });
});

describe('invalid samples', () => {
  const cases: [file: string, expectedErrors: [string, number | null][]][] = [
    ['invalid_missing_column.csv', [['VR-03', null]]],
    [
      'invalid_negative_cost.csv',
      [
        ['VR-06', 3],
        ['VR-06', 4],
      ],
    ],
    ['invalid_percent_over_100.csv', [['VR-07', 3]]],
    [
      'invalid_bad_dates.csv',
      [
        ['VR-08', 2],
        ['VR-08', 3],
        ['VR-08', 4],
      ],
    ],
    ['invalid_duplicate_ids.csv', [['VR-04', 4]]],
    ['invalid_empty.csv', [['VR-15', null]]],
  ];

  it.each(cases)('UT-SMP-05 %s produces the expected errors', (file, expected) => {
    const result = importTasksCsv(read(file));
    expect(result.valid).toBe(false);
    expect(summary(result.errors)).toEqual(expected);
  });

  it('UT-SMP-06 error messages name the row, column and value', () => {
    expect(importTasksCsv(read('invalid_missing_column.csv')).errors[0]!.message).toBe(
      "Missing required column 'Actual Cost'.",
    );
    expect(importTasksCsv(read('invalid_percent_over_100.csv')).errors[0]!.message).toBe(
      "Row 3, '% Complete': value 120 must be between 0 and 100",
    );
    expect(importTasksCsv(read('invalid_negative_cost.csv')).errors.map((e) => e.message)).toEqual([
      "Row 3, 'Actual Cost': value -500 must be between 0 and 1,000,000,000,000",
      "Row 4, 'Budget': value -20000 must be between 0 and 1,000,000,000,000",
    ]);
    expect(importTasksCsv(read('invalid_duplicate_ids.csv')).errors[0]!.message).toBe(
      `Row 4, 'Task ID': value "1.2" is already used in row 3; Task IDs must be unique`,
    );
  });

  it('UT-SMP-07 the empty file and wrong extension are rejected before reading', () => {
    expect(summary(validateFileMeta(meta('invalid_empty.csv')).errors)).toEqual([['VR-15', null]]);
    expect(summary(validateFileMeta(meta('invalid_wrong_extension.txt')).errors)).toEqual([
      ['VR-01', null],
    ]);
  });

  it('UT-SMP-08 formula-injection text is imported as literal text with VR-16 warnings', () => {
    const result = importTasksCsv(read('invalid_formula_injection.csv'));
    expect(result.valid).toBe(true);
    expect(summary(result.warnings)).toEqual([
      ['VR-16', 2],
      ['VR-16', 3],
      ['VR-16', 4],
      ['VR-16', 5],
    ]);
    expect(result.tasks.map((t) => t.name)).toEqual([
      '=HYPERLINK("http://example.invalid","Click me")',
      "+SUM(1+1)*cmd|' /C calc'!A0",
      '@SUM(A1:A10)',
      "-2+3+cmd|' /C notepad'!A0",
      "<script>alert('xss')</script>",
    ]);
  });
});
