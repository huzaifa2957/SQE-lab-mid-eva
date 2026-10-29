// FR-42: the computed task table as CSV (UTF-8 with BOM). Text is formula-escaped by
// core `toCsv` (SR-04); numbers are written as numbers, rounded to 2 dp for display.

import { toCsv } from '@evm/core';
import { type ReportData, TASK_EXPORT_COLUMNS, taskExportRow } from './reportData';

/** 2 dp, like the app's tables; null (N/A in core) is written as "N/A". */
function displayValue(value: string | number | null): string | number {
  if (value === null) return 'N/A';
  return typeof value === 'number' ? Math.round(value * 100) / 100 : value;
}

export function buildTaskCsv(report: ReportData): string {
  const currency = report.project.currency;
  const header = TASK_EXPORT_COLUMNS.map((c) =>
    c.kind === 'money' ? `${c.label} (${currency})` : c.label,
  );
  const rows = report.tasks.map((_, i) => taskExportRow(report, i).map(displayValue));
  return toCsv([header, ...rows]);
}
