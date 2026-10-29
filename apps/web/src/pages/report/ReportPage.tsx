import {
  countAnomaliesBySeverity,
  formatCurrency,
  formatIndex,
  formatPercent,
  type ProjectDocument,
  reportFileName,
} from '@evm/core';
import { FileDown, FileSpreadsheet, FileText, Loader2, TriangleAlert } from 'lucide-react';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { NoProjectState } from '../../components/NoProjectState';
import { healthBadge } from '../../components/statusLabels';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAnalysis } from '../../lib/analysis';
import { XLSX_MIME } from '../../lib/excel';
import { downloadBlob, downloadText } from '../../lib/files';
import { buildTaskCsv } from '../../lib/report/csvReport';
import { buildExcelReport } from '../../lib/report/excelReport';
import { buildPdfReport, CHART_META } from '../../lib/report/pdfReport';
import {
  ALL_SECTIONS,
  buildReportData,
  INSIGHT_STATUS_TEXT,
  REPORT_SECTIONS,
  type ReportData,
  type ReportSection,
} from '../../lib/report/reportData';
import { createChartRegistry } from '../../state/chartImages';
import type { Navigate } from '../../state/navigation';
import { useProjects } from '../../state/ProjectStore';
import { useToast } from '../../state/ToastProvider';
import { PrintCharts } from './PrintCharts';

type ExportKind = 'pdf' | 'excel' | 'csv';

const EXPORTS: Record<ExportKind, { label: string; extension: string }> = {
  pdf: { label: 'PDF', extension: 'pdf' },
  excel: { label: 'Excel', extension: 'xlsx' },
  csv: { label: 'CSV', extension: 'csv' },
};

export function ReportPage({ onNavigate }: { onNavigate: Navigate }) {
  const { current } = useProjects();
  if (!current) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Report" />
        <NoProjectState onNavigate={onNavigate} what="the report" />
      </div>
    );
  }
  return <Report key={current.project.id} document={current} />;
}

function Report({ document }: { document: ProjectDocument }) {
  const toast = useToast();
  const analysis = useAnalysis(document);
  const registry = useMemo(createChartRegistry, []);
  const [sections, setSections] = useState<ReadonlySet<ReportSection>>(ALL_SECTIONS);
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [confirm, setConfirm] = useState<ExportKind | null>(null);
  const { project } = document;

  // Recomputed with the current time at export; this copy drives the preview and warnings.
  const preview = useMemo(() => buildReportData(document, new Date()), [document]);

  const toggle = (id: ReportSection) =>
    setSections((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // FR-40…FR-43, RL-02: every export is guarded; failures become a toast, never a crash.
  const run = async (kind: ExportKind) => {
    setConfirm(null);
    setBusy(kind);
    const name = reportFileName(project.name, project.statusDate, EXPORTS[kind].extension);
    try {
      const report = buildReportData(document, new Date());
      if (kind === 'pdf') {
        const pdf = await buildPdfReport(report, sections, registry.getAll());
        downloadBlob(new Blob([pdf], { type: 'application/pdf' }), name);
      } else if (kind === 'excel') {
        const xlsx = await buildExcelReport(report, sections);
        downloadBlob(new Blob([xlsx], { type: XLSX_MIME }), name);
      } else {
        downloadText(buildTaskCsv(report), name, 'text/csv;charset=utf-8');
      }
      toast({
        tone: 'success',
        title: `${EXPORTS[kind].label} report downloaded`,
        description: name,
      });
    } catch {
      toast({
        tone: 'error',
        title: `Could not create the ${EXPORTS[kind].label} report`,
        description: 'Nothing was downloaded. Try again, or turn off some sections and retry.',
        duration: 0,
      });
    } finally {
      setBusy(null);
    }
  };

  const request = (kind: ExportKind) => {
    if (preview.warnings.length > 0) setConfirm(kind);
    else void run(kind);
  };

  const disabled = busy !== null || sections.size === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Report"
        description={`Download ${project.name} as a PDF report, an Excel workbook or a CSV task table. File names follow EVM_<project>_<status date>.`}
        actions={
          <>
            {busy && (
              <span role="status" className="flex items-center gap-2 text-control text-muted">
                <Loader2 size={16} aria-hidden="true" className="motion-safe:animate-spin" />
                {`Generating ${EXPORTS[busy].label}…`}
              </span>
            )}
            <Button icon={FileSpreadsheet} onClick={() => request('excel')} disabled={disabled}>
              Excel
            </Button>
            <Button icon={FileText} onClick={() => request('csv')} disabled={busy !== null}>
              CSV
            </Button>
            <Button
              variant="primary"
              icon={FileDown}
              onClick={() => request('pdf')}
              disabled={disabled}
            >
              Download PDF
            </Button>
          </>
        }
      />

      {preview.warnings.length > 0 && <Warnings warnings={preview.warnings} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <SectionPicker sections={sections} onToggle={toggle} />
        <Preview report={preview} sections={sections} />
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title="Export with warnings?"
        message={
          <div className="flex flex-col gap-3">
            <p>Please check these before sharing the report:</p>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-control">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        }
        confirmLabel={confirm ? `Export ${EXPORTS[confirm].label} anyway` : 'Export anyway'}
        onConfirm={() => confirm && void run(confirm)}
        onCancel={() => setConfirm(null)}
      />

      <PrintCharts document={document} analysis={analysis} registry={registry} />
    </div>
  );
}

function Warnings({ warnings }: { warnings: readonly string[] }) {
  return (
    <section
      aria-label="Report warnings"
      className="flex gap-3 rounded-xl bg-warning-soft p-4 text-control text-warning-strong"
    >
      <TriangleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">Check before exporting (you can still export)</p>
        <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SectionPicker({
  sections,
  onToggle,
}: {
  sections: ReadonlySet<ReportSection>;
  onToggle: (id: ReportSection) => void;
}) {
  const id = useId();
  return (
    <Card
      title="Include in the report"
      description="PDF and Excel use these; CSV is always the task table."
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Report sections</legend>
        {REPORT_SECTIONS.map((section) => (
          <label
            key={section.id}
            htmlFor={`${id}-${section.id}`}
            className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-card-subtle"
          >
            <input
              id={`${id}-${section.id}`}
              type="checkbox"
              checked={sections.has(section.id)}
              onChange={() => onToggle(section.id)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-feature"
            />
            <span>
              <span className="block text-control font-medium text-text">{section.label}</span>
              <span className="block text-support text-muted">{section.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {sections.size === 0 && (
        <p className="mt-3 text-support text-warning-strong">
          Choose at least one section for the PDF and Excel reports.
        </p>
      )}
    </Card>
  );
}

function PreviewItem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="border-b border-border py-3 last:border-b-0">
      <h3 className="font-display text-body font-medium text-text">{title}</h3>
      <div className="mt-1 text-control text-muted">{children}</div>
    </li>
  );
}

function Preview({
  report,
  sections,
}: {
  report: ReportData;
  sections: ReadonlySet<ReportSection>;
}) {
  const { project, metrics } = report;
  const money = (value: number | null) => formatCurrency(value, project.currency);
  const badge = healthBadge(report.health);
  const counts = countAnomaliesBySeverity(report.anomalies);
  const latest = report.snapshots.at(-1)?.snapshot.date;
  const ai = report.aiSummary;
  const label = (id: ReportSection) => REPORT_SECTIONS.find((s) => s.id === id)!.label;

  return (
    <Card title="Preview" description="What the PDF report will contain.">
      <div className="rounded-lg bg-feature p-5 text-feature-text">
        <p className="font-mono text-support tracking-wider text-feature-muted uppercase">
          Cover page
        </p>
        <p className="mt-1 font-display text-subsection font-medium">{project.name}</p>
        <p className="mt-1 text-control text-feature-muted">
          {project.currency} · {project.startDate} to {project.endDate} · status date{' '}
          {project.statusDate}
        </p>
        <div className="mt-3">
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
      </div>
      <ol aria-label="Report contents" className="mt-2 flex flex-col">
        {sections.has('kpis') && (
          <PreviewItem title={label('kpis')}>
            CPI {formatIndex(metrics.cpi)} · SPI {formatIndex(metrics.spi)} · EAC{' '}
            {money(metrics.eacPrimary)} · VAC {money(metrics.vac)} ·{' '}
            {formatPercent(metrics.percentComplete)} complete
          </PreviewItem>
        )}
        {sections.has('charts') && (
          <PreviewItem title={label('charts')}>
            {CHART_META.map((c) => c.title).join(' · ')} (light theme, PDF only)
          </PreviewItem>
        )}
        {sections.has('tasks') && (
          <PreviewItem title={label('tasks')}>
            {report.tasks.length} tasks · estimated {money(metrics.bac)} · actual{' '}
            {money(metrics.ac)}
          </PreviewItem>
        )}
        {sections.has('insights') && (
          <PreviewItem title={label('insights')}>
            {report.insights.length === 0
              ? 'No insights yet.'
              : `${report.insights.length} insights — first: ${INSIGHT_STATUS_TEXT[report.insights[0]!.status]} (${report.insights[0]!.ruleId})`}
          </PreviewItem>
        )}
        {sections.has('anomalies') && (
          <PreviewItem title={label('anomalies')}>
            {report.anomalies.length === 0
              ? 'No unusual expenses found.'
              : `${report.anomalies.length} found: ${counts.high} high, ${counts.medium} medium, ${counts.low} low`}
          </PreviewItem>
        )}
        {sections.has('aiSummary') && (
          <PreviewItem title={label('aiSummary')}>
            {!ai ? (
              'Not generated yet (Insights page → Generate AI summary).'
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={ai.source === 'ai' ? 'info' : 'neutral'}>
                  {ai.source === 'ai'
                    ? 'AI-generated — verify before use'
                    : 'Generated offline (rule-based)'}
                </Badge>
                {report.aiSummaryOutOfDate && <Badge tone="warning">Out of date</Badge>}
              </span>
            )}
          </PreviewItem>
        )}
        {sections.has('snapshots') && (
          <PreviewItem title={label('snapshots')}>
            {report.snapshots.length === 0
              ? 'No status updates recorded yet.'
              : `${report.snapshots.length} status updates, latest ${latest}`}
          </PreviewItem>
        )}
        {sections.has('formulas') && (
          <PreviewItem title={label('formulas')}>
            {report.formulas.length} metrics with formula and meaning
          </PreviewItem>
        )}
      </ol>
      {sections.size === 0 && <p className="text-control text-muted">Nothing selected.</p>}
    </Card>
  );
}
