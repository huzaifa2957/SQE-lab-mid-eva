// @vitest-environment node
// Report builders (FR-40…FR-42, SR-04): Excel is read back with ExcelJS, the CSV is parsed,
// and the PDF is checked through its (uncompressed) text — not its visuals.

import { readFileSync } from 'node:fs';
import {
  computeProjectMetrics,
  importTasksCsv,
  parseCsv,
  type ProjectDocument,
  UTF8_BOM,
} from '@evm/core';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildTaskCsv } from '../lib/report/csvReport';
import { buildExcelReport } from '../lib/report/excelReport';
import { buildPdfReport, pdfText } from '../lib/report/pdfReport';
import { ALL_SECTIONS, buildReportData, type ReportSection } from '../lib/report/reportData';
import { buildSampleDocument } from '../lib/sampleProject';
import { makeDocument } from './render';

const NOW = new Date(2026, 3, 3, 14, 5);
const sample = () => buildSampleDocument('sample', '2026-04-03T00:00:00.000Z');

const injection = (): ProjectDocument => {
  const csv = readFileSync(
    new URL('../../../../samples/invalid_formula_injection.csv', import.meta.url),
    'utf8',
  );
  return makeDocument({ tasks: importTasksCsv(csv).tasks });
};

async function readWorkbook(buffer: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

const column = (sheet: ExcelJS.Worksheet, n: number) =>
  sheet
    .getColumn(n)
    .values.slice(2)
    .map((v) => v);

describe('report data (FR-40)', () => {
  it('UT-RPT-01 uses core values and flags warnings: no tasks, out-of-date AI summary', () => {
    const report = buildReportData(sample(), NOW);
    expect(report.metrics).toEqual(
      computeProjectMetrics(sample().tasks, sample().project.statusDate, sample().eacMethod),
    );
    expect(report.kpis).toHaveLength(16);
    expect(report.health).toBe('red');
    expect(report.warnings).toEqual([]);

    const empty = buildReportData(makeDocument({ tasks: [] }), NOW);
    expect(empty.warnings).toEqual(['The project has no tasks, so most figures are N/A.']);
    expect(empty.kpis.find((k) => k.label.startsWith('Cost performance'))!.value).toBeNull();

    const stale = buildReportData(
      {
        ...sample(),
        aiSummary: {
          executiveSummary: 'x',
          keyRisks: ['a', 'b'],
          recommendations: ['1', '2', '3'],
          source: 'ai',
          generatedAt: '2026-04-03T09:00:00.000Z',
          fingerprint: '00000000',
        },
      },
      NOW,
    );
    expect(stale.aiSummaryOutOfDate).toBe(true);
    expect(stale.warnings[0]).toMatch(/AI summary is out of date/);
  });
});

describe('Excel report (FR-41)', () => {
  it('UT-RPT-02 has the expected sheets with styled, frozen, filtered headers', async () => {
    const wb = await readWorkbook(
      await buildExcelReport(buildReportData(sample(), NOW), ALL_SECTIONS),
    );
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'Summary',
      'Tasks',
      'Snapshots',
      'Insights',
      'Anomalies',
      'AI Summary',
    ]);
    for (const sheet of wb.worksheets) {
      const header = sheet.getRow(1).getCell(1);
      expect(header.font?.bold).toBe(true);
      expect(header.font?.color?.argb).toBe('FFFFFFFF');
      expect((header.fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF183A2B');
      expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
      expect(sheet.autoFilter).toBeTruthy();
    }
  });

  it('UT-RPT-03 writes numbers as numbers with currency, % and 2 dp formats (sample project)', async () => {
    const doc = sample();
    const report = buildReportData(doc, NOW);
    const wb = await readWorkbook(await buildExcelReport(report, ALL_SECTIONS));

    const summary = wb.getWorksheet('Summary')!;
    const row = (label: RegExp) =>
      summary
        .getRows(2, summary.rowCount - 1)!
        .find((r) => label.test(String(r.getCell(1).value)))!;
    expect(row(/^Project$/).getCell(2).value).toBe(doc.project.name);
    const cpi = row(/\(CPI\)/);
    expect(cpi.getCell(2).value).toBeCloseTo(report.metrics.cpi!, 10);
    expect(cpi.getCell(2).numFmt).toBe('0.00');
    expect(cpi.getCell(3).value).toBe('Action needed');
    const bac = row(/\(BAC\)/).getCell(2);
    expect(bac.value).toBe(report.metrics.bac);
    expect(bac.numFmt).toBe('#,##0.00');
    const pct = row(/^% complete$/).getCell(2);
    expect(pct.value).toBeCloseTo(report.metrics.percentComplete! / 100, 10);
    expect(pct.numFmt).toBe('0.00%');
    expect(String(row(/^Estimate at completion/).getCell(1).value)).toMatch(/typical/);

    const tasks = wb.getWorksheet('Tasks')!;
    const headers = (tasks.getRow(1).values as unknown[]).slice(1);
    expect(headers.slice(0, 4)).toEqual([
      'Task ID',
      'Task Name',
      'Category',
      `Budget (estimated cost) (${doc.project.currency})`,
    ]);
    expect(headers).toContain('CPI');
    expect(column(tasks, 1)).toEqual(doc.tasks.map((t) => t.id));
    expect(column(tasks, 4)).toEqual(doc.tasks.map((t) => t.budget));
    const cpiCol = headers.indexOf('CPI') + 1;
    report.taskMetrics.forEach((m, i) => {
      const cell = tasks.getRow(i + 2).getCell(cpiCol);
      if (m.cpi === null) expect(cell.value).toBe('N/A');
      else expect(cell.value).toBeCloseTo(m.cpi, 10);
    });
    const flags = column(tasks, headers.indexOf('Unusual expenses') + 1);
    expect(flags[doc.tasks.findIndex((t) => t.id === '3.2')]).toBe('AN-02');

    expect(wb.getWorksheet('Snapshots')!.rowCount).toBe(doc.snapshots.length + 1);
    expect(column(wb.getWorksheet('Insights')!, 1)).toEqual(report.insights.map((i) => i.ruleId));
    expect(column(wb.getWorksheet('Anomalies')!, 1)).toEqual(['AN-01', 'AN-02']);
    expect(column(wb.getWorksheet('AI Summary')!, 2)[0]).toMatch(
      /No AI summary has been generated/,
    );
  });

  it('UT-RPT-04 sections that are switched off are left out', async () => {
    const sections = new Set<ReportSection>(['tasks']);
    const wb = await readWorkbook(await buildExcelReport(buildReportData(sample(), NOW), sections));
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Summary', 'Tasks']);
    expect(wb.getWorksheet('Summary')!.rowCount).toBe(9); // project details only, no KPIs
  });

  it('UT-RPT-05 formula text from invalid_formula_injection.csv is stored as plain text (SR-04)', async () => {
    const wb = await readWorkbook(
      await buildExcelReport(buildReportData(injection(), NOW), ALL_SECTIONS),
    );
    const tasks = wb.getWorksheet('Tasks')!;
    const names = column(tasks, 2);
    expect(names.slice(0, 4).every((n) => typeof n === 'string' && n.startsWith("'"))).toBe(true);
    expect(names[4]).toBe("<script>alert('xss')</script>");
    tasks.eachRow((row) =>
      row.eachCell((cell) => expect(cell.type).not.toBe(ExcelJS.ValueType.Formula)),
    );
    expect(typeof column(tasks, 4)[0]).toBe('number');
  });
});

describe('CSV export (FR-42, SR-04)', () => {
  it('UT-RPT-06 the computed task table with a BOM, rounded numbers and N/A', () => {
    const doc = sample();
    const report = buildReportData(doc, NOW);
    const csv = buildTaskCsv(report);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    const { sheet } = parseCsv(csv.slice(1));
    expect(sheet.headers.slice(0, 2)).toEqual(['Task ID', 'Task Name']);
    expect(sheet.headers).toContain('Variance (PKR)');
    const rows = sheet.rows.filter((r) => r.some((v) => v !== ''));
    expect(rows).toHaveLength(doc.tasks.length);
    const cpiIndex = sheet.headers.indexOf('CPI');
    const first = report.taskMetrics[0]!;
    expect(Number(rows[0]![cpiIndex])).toBe(Math.round(first.cpi! * 100) / 100);
    const pvIndex = sheet.headers.indexOf('PV (PKR)');
    expect(
      rows.some((r) => r[pvIndex] === 'N/A') || report.taskMetrics.every((m) => m.pv !== null),
    ).toBe(true);
  });

  it('UT-RPT-07 injection names are escaped and numbers are not', () => {
    const csv = buildTaskCsv(buildReportData(injection(), NOW));
    const lines = csv.slice(1).split('\r\n');
    expect(lines[1]).toMatch(/^1\.1,"'=HYPERLINK\(/);
    expect(lines[2]).toMatch(/^1\.2,'\+SUM/);
    expect(lines[3]).toMatch(/^1\.3,'@SUM/);
    expect(lines[4]).toMatch(/^1\.4,'-2\+3/);
    expect(lines.slice(1).every((l) => !/,[=+@]/.test(l))).toBe(true);
  });
});

describe('PDF report (FR-40)', () => {
  const pdfString = async (doc: ProjectDocument, sections = ALL_SECTIONS) =>
    new TextDecoder('latin1').decode(
      await buildPdfReport(buildReportData(doc, NOW), sections, {}, { compress: false }),
    );

  it('UT-RPT-08 builds without errors and contains every section heading and key values', async () => {
    const text = await pdfString(sample());
    expect(text.startsWith('%PDF-')).toBe(true);
    for (const heading of [
      'EARNED VALUE MANAGEMENT REPORT',
      'OVERALL HEALTH',
      'At risk',
      'CONTENTS',
      'KPI summary',
      'Charts',
      'Task table',
      'Insights',
      'Unusual expenses',
      'AI summary',
      'Snapshot history',
      'Formula appendix',
    ]) {
      expect(text, heading).toContain(`(${heading})`);
    }
    expect(text).toContain('(Page 1 of ');
    expect(text).toContain('Status date 2026-04-03');
    expect(text).toContain('(Action needed)');
    expect(text).toContain('Chart not available');
    expect(text).toMatch(/\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/); // A4 portrait
  });

  it('UT-RPT-09 shows N/A for null values, AI labels, and omits switched-off sections', async () => {
    const empty = await pdfString(makeDocument({ tasks: [] }), new Set(['kpis', 'aiSummary']));
    expect(empty).toContain('(N/A)');
    expect(empty).not.toContain('(Formula appendix)');
    expect(empty).toContain('No AI summary has been generated yet');

    const withAi = await pdfString(
      {
        ...sample(),
        aiSummary: {
          executiveSummary: 'Costs are 13% over plan.',
          keyRisks: ['Overrun on 2.3', 'Late fit-out'],
          recommendations: ['Review 2.3', 'Re-plan', 'Report EAC'],
          source: 'ai',
          generatedAt: '2026-04-03T09:00:00.000Z',
          fingerprint: '00000000',
        },
      },
      new Set(['aiSummary']),
    );
    expect(withAi).toContain('AI-generated');
    expect(withAi).toContain('verify before use');
    expect(withAi).toContain('Out of date');
    expect(withAi).toContain('(Costs are 13% over plan.)');
  });

  it('UT-RPT-10 text is mapped to characters the PDF font can draw', () => {
    expect(pdfText('CPI 0.95 → 0.90, Σ budgets, −5 ≥ 1 — ok… 漢')).toBe(
      'CPI 0.95 -> 0.90, Sum of budgets, -5 >= 1 — ok… ?',
    );
  });
});
