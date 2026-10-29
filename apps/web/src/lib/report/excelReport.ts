// FR-41: Excel report with ExcelJS. Values are written as numbers (with number formats) so
// users can calculate with them; every text cell is formula-escaped (SR-04).

import { escapeSpreadsheetCell } from '@evm/core';
import type { Cell, Workbook } from 'exceljs';
import { loadExcel } from '../excel';
import {
  EAC_METHOD_LABEL,
  formatDateTime,
  INSIGHT_STATUS_TEXT,
  insightTip,
  type ReportData,
  type ReportSection,
  SEVERITY_TEXT,
  statusText,
  TASK_EXPORT_COLUMNS,
  taskExportRow,
  type ValueFormat,
} from './reportData';

type Kind = ValueFormat | 'text' | 'wrap';
type Value = string | number | null | undefined;

interface Column {
  header: string;
  width: number;
  kind: Kind;
}

const HEADER_FILL = 'FF183A2B'; // --feature (forest green)
const HEADER_TEXT = 'FFFFFFFF';

export const NUMBER_FORMATS: Record<ValueFormat, string> = {
  money: '#,##0.00',
  percent: '0.00%',
  index: '0.00',
};

/** Writes one cell: numbers as numbers (percent values → fractions), N/A for null, text escaped. */
function setCell(cell: Cell, value: Value, kind: Kind): void {
  if (value === null || value === undefined) {
    cell.value = kind === 'text' || kind === 'wrap' ? '' : 'N/A';
    if (kind !== 'text' && kind !== 'wrap') cell.alignment = { horizontal: 'right' };
    return;
  }
  if (typeof value === 'number') {
    if (kind === 'percent') {
      cell.value = value / 100;
      cell.numFmt = NUMBER_FORMATS.percent;
    } else {
      cell.value = value;
      if (kind === 'money' || kind === 'index') cell.numFmt = NUMBER_FORMATS[kind];
    }
    return;
  }
  cell.value = escapeSpreadsheetCell(value);
  if (kind === 'wrap') cell.alignment = { wrapText: true, vertical: 'top' };
}

function addTableSheet(
  workbook: Workbook,
  name: string,
  columns: readonly Column[],
  rows: readonly (readonly Value[])[],
  rowKinds?: readonly (Kind | undefined)[],
): void {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({ width: c.width }));

  const header = sheet.getRow(1);
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  header.height = 22;

  rows.forEach((values, r) => {
    const row = sheet.getRow(r + 2);
    values.forEach((value, i) => {
      // Summary rows mix formats: a per-row kind overrides the "Value" column's kind.
      const kind = (i === 1 && rowKinds?.[r]) || columns[i]!.kind;
      setCell(row.getCell(i + 1), value, kind);
    });
  });

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

export async function buildExcelReport(
  report: ReportData,
  sections: ReadonlySet<ReportSection>,
): Promise<ArrayBuffer> {
  const { Workbook: WorkbookClass } = await loadExcel();
  const workbook = new WorkbookClass();
  workbook.creator = 'EVM Cost Tracker';
  workbook.created = report.generatedAt;
  const { project } = report;
  const currency = project.currency;

  // Summary: project details, then the KPIs (FR-41)
  const summary: [string, Value, string][] = [
    ['Project', project.name, ''],
    ['Currency', currency, ''],
    ['Start date', project.startDate, ''],
    ['End date', project.endDate, ''],
    ['Status date', project.statusDate, ''],
    ['Generated', formatDateTime(report.generatedAt), ''],
    ['Overall health', statusText(report.health) || 'Not enough data', ''],
    ['Primary EAC method', EAC_METHOD_LABEL[report.eacMethod], ''],
  ];
  const kinds: (Kind | undefined)[] = summary.map(() => 'text');
  if (sections.has('kpis')) {
    for (const kpi of report.kpis) {
      summary.push([kpi.label, kpi.value, statusText(kpi.status)]);
      kinds.push(kpi.format);
    }
  }
  addTableSheet(
    workbook,
    'Summary',
    [
      { header: 'Item', width: 48, kind: 'text' },
      { header: 'Value', width: 22, kind: 'text' },
      { header: 'Status', width: 16, kind: 'text' },
    ],
    summary,
    kinds,
  );

  if (sections.has('tasks')) {
    addTableSheet(
      workbook,
      'Tasks',
      TASK_EXPORT_COLUMNS.map((c) => ({
        header: c.kind === 'money' ? `${c.label} (${currency})` : c.label,
        width:
          c.key === 'name' ? 36 : c.key === 'anomalies' ? 20 : Math.max(12, c.label.length + 4),
        kind: c.kind,
      })),
      report.tasks.map((_, i) => taskExportRow(report, i)),
    );
  }

  if (sections.has('snapshots')) {
    addTableSheet(
      workbook,
      'Snapshots',
      [
        { header: 'Date', width: 14, kind: 'text' },
        { header: `PV (${currency})`, width: 16, kind: 'money' },
        { header: `EV (${currency})`, width: 16, kind: 'money' },
        { header: `AC (${currency})`, width: 16, kind: 'money' },
        { header: `CV (${currency})`, width: 16, kind: 'money' },
        { header: `SV (${currency})`, width: 16, kind: 'money' },
        { header: 'CPI', width: 10, kind: 'index' },
        { header: 'SPI', width: 10, kind: 'index' },
      ],
      report.snapshots.map(({ snapshot, metrics }) => [
        snapshot.date,
        snapshot.pv,
        snapshot.ev,
        snapshot.ac,
        metrics.cv,
        metrics.sv,
        metrics.cpi,
        metrics.spi,
      ]),
    );
  }

  if (sections.has('insights')) {
    addTableSheet(
      workbook,
      'Insights',
      [
        { header: 'Rule', width: 10, kind: 'text' },
        { header: 'Status', width: 16, kind: 'text' },
        { header: 'Message', width: 70, kind: 'wrap' },
        { header: 'What to do', width: 60, kind: 'wrap' },
      ],
      report.insights.map((i) => [
        i.ruleId,
        INSIGHT_STATUS_TEXT[i.status],
        i.message,
        insightTip(i),
      ]),
    );
  }

  if (sections.has('anomalies')) {
    addTableSheet(
      workbook,
      'Anomalies',
      [
        { header: 'Rule', width: 10, kind: 'text' },
        { header: 'Severity', width: 12, kind: 'text' },
        { header: 'Task ID', width: 12, kind: 'text' },
        { header: 'Snapshot date', width: 14, kind: 'text' },
        { header: 'Reason', width: 90, kind: 'wrap' },
      ],
      report.anomalies.map((a) => [
        a.ruleId,
        SEVERITY_TEXT[a.severity],
        a.taskId ?? '',
        a.snapshotDate ?? '',
        a.message,
      ]),
    );
  }

  if (sections.has('aiSummary')) {
    const s = report.aiSummary;
    const rows: [string, string][] = s
      ? [
          [
            'Source',
            s.source === 'ai'
              ? 'AI-generated — verify before use'
              : 'Generated offline (rule-based)',
          ],
          ...(s.reason ? [['Reason', s.reason] as [string, string]] : []),
          ['Generated', formatDateTime(new Date(s.generatedAt))],
          ['Up to date', report.aiSummaryOutOfDate ? 'No — the data changed afterwards' : 'Yes'],
          ['Executive summary', s.executiveSummary],
          ...s.keyRisks.map((r, i) => [`Key risk ${i + 1}`, r] as [string, string]),
          ...s.recommendations.map((r, i) => [`Recommendation ${i + 1}`, r] as [string, string]),
        ]
      : [['Status', 'No AI summary has been generated yet (Insights page → Generate AI summary).']];
    addTableSheet(
      workbook,
      'AI Summary',
      [
        { header: 'Field', width: 22, kind: 'text' },
        { header: 'Text', width: 100, kind: 'wrap' },
      ],
      rows,
    );
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
