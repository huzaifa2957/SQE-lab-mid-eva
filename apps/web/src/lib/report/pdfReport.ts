// FR-40: PDF report with jsPDF + jspdf-autotable (A4 portrait, light palette, Helvetica).
// All numbers come from core (via ReportData) and are formatted with core format.ts.

import { formatCurrency, formatIndex, formatPercent, type MetricValue } from '@evm/core';
import type { jsPDF as JsPdf } from 'jspdf';
import type { CellInput, UserOptions } from 'jspdf-autotable';
import { healthBadge } from '../../components/statusLabels';
import type { ChartId } from '../../state/chartImages';
import {
  EAC_METHOD_LABEL,
  formatDateTime,
  INSIGHT_STATUS_TEXT,
  insightTip,
  type ReportData,
  type ReportSection,
  REPORT_SECTIONS,
  SEVERITY_TEXT,
  statusText,
  type ValueFormat,
} from './reportData';

// Light-mode design tokens (docs/design-system.md §4) — PDFs always use the light palette.
const C = {
  feature: '#183A2B',
  featureText: '#F4F5EF',
  featureMuted: '#B7CDBE',
  accent: '#D4F468',
  text: '#17241C',
  muted: '#5B685F',
  border: '#D8DED3',
  subtle: '#F8F9F4',
  successSoft: '#E3F1E7',
  successStrong: '#2A6640',
  warningSoft: '#FBF0D9',
  warningStrong: '#7A5410',
  errorSoft: '#F7E3E2',
  errorStrong: '#933B37',
} as const;

const PAGE = { width: 210, height: 297 };
const MARGIN = { left: 18, right: 18, top: 20, bottom: 22 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const BOTTOM = PAGE.height - MARGIN.bottom;

export const CHART_META: readonly { id: ChartId; title: string; caption: string }[] = [
  {
    id: 's-curve',
    title: 'S-curve',
    caption:
      'Cumulative planned value (dotted), earned value and actual cost over time, with the budget and the forecast at completion.',
  },
  {
    id: 'cost-by-task',
    title: 'Estimated vs actual cost',
    caption: 'Budget (outlined) compared with actual cost (solid) for each task.',
  },
  {
    id: 'cpi-spi-trend',
    title: 'CPI and SPI trend',
    caption:
      'Cost (CPI, solid) and schedule (SPI, dashed) efficiency at each status update; 1.00 is on target.',
  },
  {
    id: 'variance-by-category',
    title: 'Cost variance by category',
    caption: 'Earned value minus actual cost per cost category; bars to the left are overruns.',
  },
];

/** Characters Helvetica (WinAnsi) can't draw, mapped to readable equivalents. */
const REPLACEMENTS: Record<string, string> = {
  '−': '-',
  '→': '->',
  '←': '<-',
  '≥': '>=',
  '≤': '<=',
  Σ: 'Sum of',
  '≈': '~',
  '✓': 'v',
  ' ': ' ',
  ' ': ' ',
};
// Latin-1 plus the extra WinAnsi characters jsPDF's standard fonts support.
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

/** Makes any text safe for the PDF standard fonts; unknown characters become "?". */
export function pdfText(text: string): string {
  let out = '';
  for (const ch of text) {
    const mapped = REPLACEMENTS[ch];
    if (mapped !== undefined) out += mapped;
    else if (ch.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.includes(ch)) out += ch;
    else out += '?';
  }
  return out;
}

function formatValue(value: MetricValue, format: ValueFormat, currency: string): string {
  if (format === 'percent') return formatPercent(value);
  if (format === 'index') return formatIndex(value);
  return formatCurrency(value, currency);
}

/** A numeric table cell: right-aligned, muted red when negative, "N/A" for null. */
function numberCell(value: MetricValue, format: ValueFormat, currency: string): CellInput {
  return {
    content: pdfText(formatValue(value, format, currency)),
    styles: {
      halign: 'right',
      ...(value !== null && value < 0 ? { textColor: C.errorStrong } : {}),
    },
  };
}

type AutoTable = (doc: JsPdf, options: UserOptions) => void;

async function loadPdf(): Promise<{ JsPdfClass: typeof JsPdf; autoTable: AutoTable }> {
  const [pdf, table] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return { JsPdfClass: pdf.jsPDF, autoTable: table.autoTable as AutoTable };
}

export interface PdfOptions {
  /** Deflate page streams (on for downloads; tests read the text uncompressed). */
  compress?: boolean;
}

export async function buildPdfReport(
  report: ReportData,
  sections: ReadonlySet<ReportSection>,
  charts: Partial<Record<ChartId, string>>,
  options: PdfOptions = {},
): Promise<ArrayBuffer> {
  const { JsPdfClass, autoTable } = await loadPdf();
  const doc = new JsPdfClass({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
    compress: options.compress ?? true,
  });
  const { project } = report;
  const currency = project.currency;
  let y = MARGIN.top;

  doc.setProperties({
    title: pdfText(`EVM report — ${project.name} — ${project.statusDate}`),
    subject: 'Earned Value Management cost report',
    creator: 'EVM Cost Tracker',
  });

  // ---- helpers -----------------------------------------------------------
  const font = (size: number, style: 'normal' | 'bold' = 'normal', color: string = C.text) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(color);
  };
  const newPage = () => {
    doc.addPage();
    y = MARGIN.top;
  };
  const ensure = (height: number) => {
    if (y + height > BOTTOM) newPage();
  };
  const lineHeight = (size: number) => size * 0.3528 * 1.35; // pt → mm × leading

  const paragraph = (text: string, size = 10, color: string = C.text, indent = 0) => {
    font(size, 'normal', color);
    const lines = doc.splitTextToSize(pdfText(text), CONTENT_WIDTH - indent) as string[];
    const step = lineHeight(size);
    for (const line of lines) {
      ensure(step);
      doc.text(line, MARGIN.left + indent, y + step * 0.75);
      y += step;
    }
  };

  const list = (items: readonly string[], numbered: boolean) => {
    items.forEach((item, i) => {
      const marker = numbered ? `${i + 1}.` : '•';
      ensure(lineHeight(10));
      font(10, 'bold', C.muted);
      doc.text(marker, MARGIN.left + 2, y + lineHeight(10) * 0.75);
      paragraph(item, 10, C.text, 8);
      y += 1;
    });
  };

  const heading = (title: string, intro?: string) => {
    ensure(28);
    if (y > MARGIN.top) y += 6;
    font(16, 'bold', C.text);
    doc.text(pdfText(title), MARGIN.left, y + 5);
    y += 8;
    doc.setDrawColor(C.accent);
    doc.setLineWidth(0.8);
    doc.line(MARGIN.left, y, MARGIN.left + 24, y);
    y += 5;
    if (intro) {
      paragraph(intro, 9, C.muted);
      y += 2;
    }
  };

  const table = (head: string[], body: CellInput[][], extra: Partial<UserOptions> = {}) => {
    autoTable(doc, {
      startY: y,
      head: [head.map(pdfText)],
      body,
      margin: { left: MARGIN.left, right: MARGIN.right, top: MARGIN.top, bottom: MARGIN.bottom },
      theme: 'grid',
      showHead: 'everyPage',
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 1.8,
        textColor: C.text,
        lineColor: C.border,
        lineWidth: 0.15,
        overflow: 'linebreak',
      },
      headStyles: { fillColor: C.feature, textColor: '#FFFFFF', fontStyle: 'bold' },
      alternateRowStyles: { fillColor: C.subtle },
      ...extra,
    });
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (last?.finalY ?? y) + 4;
  };

  const text = (value: string): CellInput => pdfText(value);
  const mono = (value: string): CellInput => ({
    content: pdfText(value),
    styles: { font: 'courier' },
  });

  // ---- cover page --------------------------------------------------------
  doc.setFillColor(C.feature);
  doc.rect(0, 0, PAGE.width, 78, 'F');
  doc.setFillColor(C.accent);
  doc.rect(0, 78, PAGE.width, 2.2, 'F');
  font(9, 'bold', C.featureMuted);
  doc.text('EARNED VALUE MANAGEMENT REPORT', MARGIN.left, 28, { charSpace: 0.4 });
  font(26, 'bold', C.featureText);
  const title = doc.splitTextToSize(pdfText(project.name), CONTENT_WIDTH) as string[];
  doc.text(title.slice(0, 2), MARGIN.left, 42);
  font(11, 'normal', C.featureMuted);
  doc.text(pdfText(`Status as of ${project.statusDate}`), MARGIN.left, 68);

  y = 96;
  const badge = healthBadge(report.health);
  const tone = {
    success: [C.successSoft, C.successStrong],
    warning: [C.warningSoft, C.warningStrong],
    error: [C.errorSoft, C.errorStrong],
  }[badge.tone as 'success' | 'warning' | 'error'] ?? [C.subtle, C.muted];
  font(9, 'bold', C.muted);
  doc.text('OVERALL HEALTH', MARGIN.left, y);
  font(12, 'bold', tone[1]);
  const badgeText = pdfText(badge.label);
  const badgeWidth = doc.getTextWidth(badgeText) + 10;
  doc.setFillColor(tone[0]!);
  doc.roundedRect(MARGIN.left, y + 3, badgeWidth, 9, 4.5, 4.5, 'F');
  doc.text(badgeText, MARGIN.left + 5, y + 9.3);
  y += 22;

  const details: [string, string][] = [
    ['Currency', project.currency],
    ['Project dates', `${project.startDate} to ${project.endDate}`],
    ['Status date', project.statusDate],
    ['Generated', formatDateTime(report.generatedAt)],
    ['Primary EAC method', EAC_METHOD_LABEL[report.eacMethod]],
    ['Tasks', String(report.tasks.length)],
  ];
  for (const [label, value] of details) {
    font(9, 'bold', C.muted);
    doc.text(pdfText(label.toUpperCase()), MARGIN.left, y);
    font(11, 'normal', C.text);
    doc.text(pdfText(value), MARGIN.left + 52, y);
    y += 8;
  }

  y += 6;
  font(9, 'bold', C.muted);
  doc.text('CONTENTS', MARGIN.left, y);
  y += 6;
  font(11, 'normal', C.text);
  REPORT_SECTIONS.filter((s) => sections.has(s.id)).forEach((s, i) => {
    doc.text(pdfText(`${i + 1}. ${s.label}`), MARGIN.left, y);
    y += 6.5;
  });

  if (report.warnings.length > 0) {
    y += 4;
    font(9, 'bold', C.warningStrong);
    doc.text('PLEASE NOTE', MARGIN.left, y);
    y += 2;
    for (const warning of report.warnings) paragraph(`• ${warning}`, 9, C.warningStrong);
  }

  newPage();

  // ---- KPI summary -------------------------------------------------------
  if (sections.has('kpis')) {
    heading(
      'KPI summary',
      `Project totals as of ${project.statusDate}. Status follows the indicator rules (§5); amounts in ${currency}.`,
    );
    table(
      ['Metric', 'Value', 'Status'],
      report.kpis.map((k) => [
        text(k.label),
        numberCell(k.value, k.format, currency),
        text(statusText(k.status) || (k.value === null ? 'N/A' : '—')),
      ]),
      { columnStyles: { 0: { cellWidth: 100 }, 2: { cellWidth: 32 } } },
    );
  }

  // ---- charts ------------------------------------------------------------
  if (sections.has('charts')) {
    // Charts are large: start them on a fresh page rather than stranding the heading.
    if (y > MARGIN.top) newPage();
    heading('Charts', 'The dashboard charts at the time of export.');
    for (const chart of CHART_META) {
      const image = charts[chart.id];
      let height = 60;
      let props: { width: number; height: number } | null = null;
      if (image) {
        try {
          props = doc.getImageProperties(image);
          height = Math.min(105, (CONTENT_WIDTH * props.height) / props.width);
        } catch {
          props = null;
        }
      }
      ensure(height + 18);
      font(12, 'bold', C.text);
      doc.text(pdfText(chart.title), MARGIN.left, y + 4);
      y += 6;
      paragraph(chart.caption, 8.5, C.muted);
      y += 1;
      let drawn = false;
      if (image && props) {
        try {
          const width = (height * props.width) / props.height;
          doc.addImage(image, 'PNG', MARGIN.left, y, width, height);
          drawn = true;
        } catch {
          drawn = false;
        }
      }
      if (!drawn) {
        height = 20;
        doc.setDrawColor(C.border);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([1.5, 1.5], 0);
        doc.roundedRect(MARGIN.left, y, CONTENT_WIDTH, height, 2, 2, 'S');
        doc.setLineDashPattern([], 0);
        font(9, 'normal', C.muted);
        doc.text('Chart not available: not enough data to draw it.', PAGE.width / 2, y + 11, {
          align: 'center',
        });
      }
      y += height + 8;
    }
  }

  // ---- task table --------------------------------------------------------
  if (sections.has('tasks')) {
    heading(
      'Task table',
      `Estimated cost is the task budget; variance = estimated − actual. Amounts in ${currency}; negative values in red.`,
    );
    if (report.tasks.length === 0) paragraph('No tasks yet.', 10, C.muted);
    else {
      const totals = report.metrics;
      table(
        ['Task ID', 'Name', 'Estimated', 'Actual', 'Variance', '% Var.', 'EV', 'CPI', 'SPI'],
        [
          ...report.tasks.map((task, i) => {
            const m = report.taskMetrics[i]!;
            const flagged = report.anomaliesByTask.has(task.id);
            return [
              mono(flagged ? `${task.id} !` : task.id),
              text(task.name),
              numberCell(task.budget, 'money', ''),
              numberCell(task.actualCost, 'money', ''),
              numberCell(m.variance, 'money', ''),
              numberCell(m.variancePercent, 'percent', ''),
              numberCell(m.ev, 'money', ''),
              numberCell(m.cpi, 'index', ''),
              numberCell(m.spi, 'index', ''),
            ];
          }),
          [
            {
              content: `Total (${report.tasks.length} tasks)`,
              colSpan: 2,
              styles: { fontStyle: 'bold' },
            },
            numberCell(totals.bac, 'money', ''),
            numberCell(totals.ac, 'money', ''),
            numberCell(totals.variance, 'money', ''),
            numberCell(totals.variancePercent, 'percent', ''),
            numberCell(totals.ev, 'money', ''),
            numberCell(totals.cpi, 'index', ''),
            numberCell(totals.spi, 'index', ''),
          ],
        ],
        {
          styles: {
            fontSize: 7.5,
            cellPadding: 1.4,
            lineColor: C.border,
            lineWidth: 0.15,
            textColor: C.text,
          },
          columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 38 } },
        },
      );
      if (report.anomaliesByTask.size > 0) {
        paragraph('"!" marks a task with an unusual expense (see Unusual expenses).', 8, C.muted);
      }
    }
  }

  // ---- insights ----------------------------------------------------------
  if (sections.has('insights')) {
    heading('Insights', 'Indicator rules from §5 that are triggered, most serious first.');
    if (report.insights.length === 0) {
      paragraph('No insights yet: add tasks with budgets, progress and actual costs.', 10, C.muted);
    } else {
      table(
        ['Rule', 'Status', 'Finding', 'What to do'],
        report.insights.map((i) => [
          mono(i.ruleId),
          text(INSIGHT_STATUS_TEXT[i.status]),
          text(i.message),
          text(insightTip(i)),
        ]),
        { columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 25 } } },
      );
    }
  }

  // ---- unusual expenses --------------------------------------------------
  if (sections.has('anomalies')) {
    heading(
      'Unusual expenses',
      'Deterministic checks AN-01…AN-06 on task costs and status history.',
    );
    if (report.anomalies.length === 0) paragraph('No unusual expenses found.', 10, C.muted);
    else {
      table(
        ['Rule', 'Task / date', 'Severity', 'Reason'],
        report.anomalies.map((a) => [
          mono(a.ruleId),
          mono(
            a.taskId
              ? `Task ${a.taskId}${a.snapshotDate ? ` (${a.snapshotDate})` : ''}`
              : (a.snapshotDate ?? ''),
          ),
          text(SEVERITY_TEXT[a.severity]),
          text(a.message),
        ]),
        { columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 30 }, 2: { cellWidth: 20 } } },
      );
    }
  }

  // ---- AI summary --------------------------------------------------------
  if (sections.has('aiSummary')) {
    heading('AI summary');
    const s = report.aiSummary;
    if (!s) {
      paragraph(
        'No AI summary has been generated yet. Use "Generate AI summary" on the Insights page.',
        10,
        C.muted,
      );
    } else {
      const label =
        s.source === 'ai' ? 'AI-generated — verify before use' : 'Generated offline (rule-based)';
      const meta = [
        `Generated ${formatDateTime(new Date(s.generatedAt))}`,
        s.source === 'offline' && s.reason ? s.reason : null,
      ]
        .filter(Boolean)
        .join(' · ');
      paragraph(`${label} · ${meta}`, 9, s.source === 'ai' ? C.warningStrong : C.muted);
      if (report.aiSummaryOutOfDate) {
        paragraph(
          'Out of date: the project data changed after this summary was generated.',
          9,
          C.warningStrong,
        );
      }
      y += 3;
      const sub = (title: string) => {
        ensure(14);
        font(9, 'bold', C.muted);
        doc.text(pdfText(title.toUpperCase()), MARGIN.left, y + 4);
        y += 7;
      };
      sub('Executive summary');
      paragraph(s.executiveSummary);
      y += 3;
      sub('Key risks');
      list(s.keyRisks, false);
      y += 2;
      sub('Recommendations');
      list(s.recommendations, true);
    }
  }

  // ---- snapshot history --------------------------------------------------
  if (sections.has('snapshots')) {
    heading('Snapshot history', `Cumulative values at each recorded status update (${currency}).`);
    if (report.snapshots.length === 0) paragraph('No status updates recorded yet.', 10, C.muted);
    else {
      table(
        ['Date', 'PV', 'EV', 'AC', 'CV', 'SV', 'CPI', 'SPI'],
        report.snapshots.map(({ snapshot, metrics }) => [
          mono(snapshot.date),
          numberCell(snapshot.pv, 'money', ''),
          numberCell(snapshot.ev, 'money', ''),
          numberCell(snapshot.ac, 'money', ''),
          numberCell(metrics.cv, 'money', ''),
          numberCell(metrics.sv, 'money', ''),
          numberCell(metrics.cpi, 'index', ''),
          numberCell(metrics.spi, 'index', ''),
        ]),
      );
    }
  }

  // ---- formula appendix --------------------------------------------------
  if (sections.has('formulas')) {
    heading(
      'Formula appendix',
      'How each metric is calculated. "N/A" means a value cannot be calculated (e.g. division by zero).',
    );
    table(
      ['Metric', 'Formula', 'Meaning'],
      report.formulas.map((f) => [
        text(`${f.abbreviation} — ${f.name}`),
        text(f.formula),
        text(f.meaning),
      ]),
      { columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 55 } } },
    );
  }

  // ---- footer on every page ----------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(C.border);
    doc.setLineWidth(0.2);
    doc.line(MARGIN.left, PAGE.height - 14, PAGE.width - MARGIN.right, PAGE.height - 14);
    font(8, 'normal', C.muted);
    const left = doc.splitTextToSize(
      pdfText(`${project.name} · Status date ${project.statusDate}`),
      CONTENT_WIDTH - 30,
    )[0] as string;
    doc.text(left, MARGIN.left, PAGE.height - 9);
    doc.text(`Page ${page} of ${pages}`, PAGE.width - MARGIN.right, PAGE.height - 9, {
      align: 'right',
    });
  }

  return doc.output('arraybuffer');
}
