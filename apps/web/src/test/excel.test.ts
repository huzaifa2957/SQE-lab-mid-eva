// @vitest-environment node
// ExcelJS round trips run in Node (JSZip and jsdom disagree about binary types).

import { importTasksCsv, PROJECT_COLUMNS, TASK_COLUMNS } from '@evm/core';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildTasksTemplateCsv } from '../lib/csvTemplate';
import { buildTemplateWorkbook, cellToPlain, readWorkbook, XLSX_MIME } from '../lib/excel';
import { readImportFile, validateImport } from '../lib/importFile';

async function workbookBuffer(build: (wb: ExcelJS.Workbook) => void): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('Excel template and import (FR-03, FR-04)', () => {
  it('UT-XL-01 the template has Instructions, Project, Tasks and Periods sheets with core headers', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildTemplateWorkbook());
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      'Instructions',
      'Project',
      'Tasks',
      'Periods',
    ]);
    const headers = (name: string) =>
      (wb.getWorksheet(name)!.getRow(1).values as unknown[]).slice(1).map(String);
    expect(headers('Tasks')).toEqual(TASK_COLUMNS.map((c) => c.label));
    expect(headers('Project')).toEqual(PROJECT_COLUMNS.map((c) => c.label));
    expect(headers('Periods')).toEqual(['Date', 'PV', 'EV', 'AC']);
  });

  it('UT-XL-02 the template imports cleanly as-is (example rows are valid)', async () => {
    const file = new File([await buildTemplateWorkbook()], 'template.xlsx', { type: XLSX_MIME });
    const read = await readImportFile(file);
    expect(read.ok).toBe(true);
    const result = validateImport(read.ok ? read.parsed : (null as never));
    expect(result.errorCount).toBe(0);
    expect(result.canImport).toBe(true);
    expect(result.tasks.tasks).toHaveLength(1);
    expect(result.periods!.snapshots).toHaveLength(1);
    expect(result.project!.project).toMatchObject({ name: 'My project', currency: 'USD' });
  });

  it('UT-XL-03 reads typed cells: dates, formulas (result only), rich text and blank rows', async () => {
    const buffer = await workbookBuffer((wb) => {
      const ws = wb.addWorksheet('Tasks');
      ws.addRow(TASK_COLUMNS.map((c) => c.label));
      ws.addRow([
        '1.1',
        { richText: [{ text: 'Rich ' }, { text: 'name' }] },
        'Labour',
        { formula: '1000*2', result: 2000 },
        new Date(Date.UTC(2026, 0, 5)),
        new Date(Date.UTC(2026, 0, 20)),
        0.5,
        { formula: 'A1', result: 400 },
      ]);
      ws.addRow([]);
      ws.addRow(['1.2', '=cmd|calc', 'Other', 10, '2026-01-05', '2026-01-06', 1, 1]);
    });
    const sheets = await readWorkbook(buffer);
    const result = validateImport(
      {
        fileName: 'x.xlsx',
        kind: 'xlsx',
        readIssues: [],
        tasks: sheets.tasks,
        periods: null,
        project: null,
      },
      { percentAsFraction: true },
    );
    expect(result.errorCount).toBe(0);
    expect(result.tasks.tasks[0]).toMatchObject({
      name: 'Rich name',
      budget: 2000,
      plannedStart: '2026-01-05',
      percentComplete: 50,
      actualCost: 400,
    });
    expect(result.tasks.tasks[1]!.name).toBe('=cmd|calc'); // kept literally (VR-16 warning)
    expect(result.tasks.warnings.map((w) => w.ruleId)).toContain('VR-16');
  });

  it('UT-XL-04 without a "Tasks" sheet the first data sheet is used; missing sheets are null', async () => {
    const buffer = await workbookBuffer((wb) => {
      wb.addWorksheet('Instructions').addRow(['read me']);
      const ws = wb.addWorksheet('Sheet1');
      ws.addRow(TASK_COLUMNS.map((c) => c.label));
    });
    const sheets = await readWorkbook(buffer);
    expect(sheets.tasksSheetName).toBe('Sheet1');
    expect(sheets.periods).toBeNull();
    expect(sheets.project).toBeNull();
  });

  it('UT-XL-05 cellToPlain handles every ExcelJS value shape', () => {
    expect(cellToPlain(null)).toBe('');
    expect(cellToPlain(5)).toBe(5);
    expect(cellToPlain({ text: 'link', hyperlink: 'http://x' })).toBe('link');
    expect(cellToPlain({ error: '#DIV/0!' } as ExcelJS.CellErrorValue)).toBe('');
    expect(cellToPlain({ sharedFormula: 'A1', result: 7 } as unknown as ExcelJS.CellValue)).toBe(7);
  });

  it('UT-XL-06 the CSV template has the core headers and a valid example row', () => {
    const text = buildTasksTemplateCsv();
    expect(text.split('\n')[0]).toBe(TASK_COLUMNS.map((c) => c.label).join(','));
    const result = importTasksCsv(text);
    expect(result.valid).toBe(true);
    expect(result.tasks).toHaveLength(1);
  });
});
