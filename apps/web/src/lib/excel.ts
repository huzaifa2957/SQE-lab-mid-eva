// Excel read/write with ExcelJS (FR-03, FR-04). ExcelJS is loaded on demand so it is not
// part of the initial bundle. Cell values are reduced to plain values; formulas are never
// evaluated — only their cached result is read.

import {
  PERIOD_COLUMNS,
  PROJECT_COLUMNS,
  type SheetData,
  TASK_COLUMNS,
  VALIDATION_LIMITS,
} from '@evm/core';
import type { CellValue, Workbook, Worksheet } from 'exceljs';

type ExcelModule = typeof import('exceljs');

export async function loadExcel(): Promise<ExcelModule> {
  const mod = (await import('exceljs')) as ExcelModule & { default?: ExcelModule };
  return mod.Workbook ? mod : mod.default!;
}

/** Reduces an ExcelJS cell value to a string, number, boolean or Date. */
export function cellToPlain(value: CellValue): unknown {
  if (value === null || value === undefined) return '';
  if (value instanceof Date || typeof value !== 'object') return value;
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('formula' in value || 'sharedFormula' in value) {
    return cellToPlain((value as { result?: CellValue }).result ?? null);
  }
  if ('text' in value) return cellToPlain(value.text as CellValue);
  if ('error' in value) return '';
  return String(value);
}

function sheetToData(worksheet: Worksheet): SheetData {
  // Read at most one row more than allowed so the core VR-02 check can report the overflow.
  const lastRow = Math.min(worksheet.rowCount, VALIDATION_LIMITS.maxRows + 2);
  const width = worksheet.columnCount;
  const read = (rowNumber: number) => {
    const row = worksheet.getRow(rowNumber);
    return Array.from({ length: width }, (_, i) => cellToPlain(row.getCell(i + 1).value));
  };
  const rows: unknown[][] = [];
  for (let r = 2; r <= lastRow; r++) rows.push(read(r));
  return { headers: lastRow >= 1 ? read(1) : [], rows };
}

export interface WorkbookSheets {
  tasks: SheetData | null;
  periods: SheetData | null;
  project: SheetData | null;
  tasksSheetName: string | null;
}

const normalise = (name: string) => name.trim().toLowerCase();
const SPECIAL = new Set(['project', 'periods', 'instructions']);

/** Finds the Project, Tasks and Periods sheets (by name; Tasks falls back to the first other sheet). */
export async function readWorkbook(buffer: ArrayBuffer): Promise<WorkbookSheets> {
  const { Workbook: WorkbookClass } = await loadExcel();
  const workbook = new WorkbookClass();
  await workbook.xlsx.load(buffer);

  const byName = (name: string) => workbook.worksheets.find((ws) => normalise(ws.name) === name);
  const tasksSheet =
    byName('tasks') ?? workbook.worksheets.find((ws) => !SPECIAL.has(normalise(ws.name)));
  const periodsSheet = byName('periods');
  const projectSheet = byName('project');

  return {
    tasks: tasksSheet ? sheetToData(tasksSheet) : null,
    periods: periodsSheet && periodsSheet.rowCount > 1 ? sheetToData(periodsSheet) : null,
    project: projectSheet && projectSheet.rowCount > 0 ? sheetToData(projectSheet) : null,
    tasksSheetName: tasksSheet?.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Template (FR-04)
// ---------------------------------------------------------------------------

export const TEMPLATE_EXAMPLE = {
  project: ['My project', 'USD', '2026-01-05', '2026-06-30', '2026-03-31'],
  task: ['1.1', 'Requirements', 'Labour', 50000, '2026-01-05', '2026-01-20', 100, 52000],
  period: ['2026-01-31', 50000, 50000, 52000],
};

const INSTRUCTIONS = [
  'EVM Cost Tracker — import template',
  '',
  'Fill in the Project, Tasks and (optionally) Periods sheets, then import this file on the Data page.',
  '',
  'Project sheet: one row with the project name, a 3-letter currency code (e.g. USD, PKR) and dates.',
  'Tasks sheet: one row per work item. Required columns: Task ID, Task Name, Budget, Planned Start,',
  '  Planned Finish, % Complete, Actual Cost. Category is optional (Labour, Material, Equipment,',
  '  Subcontract, Other).',
  'Periods sheet (optional): cumulative PV, EV and AC at each reporting date, oldest first.',
  '',
  'Dates: YYYY-MM-DD or DD/MM/YYYY, or Excel date cells.',
  'Amounts: numbers such as 1200, 1,200 or Rs 1200. Must be 0 or more.',
  '% Complete: 0–100 (e.g. 45 or 45%). Values written as fractions (0.45) can be converted on import.',
  'Limits: .csv or .xlsx, at most 5 MB and 5,000 task rows.',
  '',
  'Replace the example rows with your own data. Blank rows are ignored.',
];

function addTable(workbook: Workbook, name: string, headers: string[], example: unknown[]): void {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers).font = { bold: true };
  sheet.addRow(example);
  sheet.columns.forEach((column, i) => {
    column.width = Math.max(14, (headers[i]?.length ?? 10) + 4);
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/** Builds template.xlsx with Instructions, Project, Tasks and Periods sheets. */
export async function buildTemplateWorkbook(): Promise<ArrayBuffer> {
  const { Workbook: WorkbookClass } = await loadExcel();
  const workbook = new WorkbookClass();
  workbook.creator = 'EVM Cost Tracker';

  const instructions = workbook.addWorksheet('Instructions');
  INSTRUCTIONS.forEach((line) => instructions.addRow([line]));
  instructions.getRow(1).font = { bold: true, size: 14 };
  instructions.getColumn(1).width = 110;

  addTable(
    workbook,
    'Project',
    PROJECT_COLUMNS.map((c) => c.label),
    TEMPLATE_EXAMPLE.project,
  );
  addTable(
    workbook,
    'Tasks',
    TASK_COLUMNS.map((c) => c.label),
    TEMPLATE_EXAMPLE.task,
  );
  addTable(
    workbook,
    'Periods',
    PERIOD_COLUMNS.map((c) => c.label),
    TEMPLATE_EXAMPLE.period,
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
