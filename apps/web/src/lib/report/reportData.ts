// Everything a report shows (FR-40…FR-42), computed by @evm/core only. The PDF, Excel and
// CSV builders format these values; they never re-implement a formula.

import {
  type Anomaly,
  buildSummaryRequest,
  computeMetricsFromTotals,
  computeTaskMetrics,
  detectAnomalies,
  type EacMethod,
  generateInsights,
  groupAnomaliesByTask,
  type HealthStatus,
  type Insight,
  INSIGHT_TIPS,
  type KpiId,
  kpiStatuses,
  METRIC_DEFINITIONS,
  type MetricDefinition,
  type MetricValue,
  overallHealth,
  type Project,
  type ProjectDocument,
  type ProjectMetrics,
  snapshotMetrics,
  sortAnomalies,
  sortInsights,
  type StatusSnapshot,
  type StoredSummary,
  summaryFingerprint,
  sumTaskMetrics,
  type Task,
  type TaskMetrics,
  validateSnapshots,
  validateTasks,
} from '@evm/core';

export type ReportSection =
  'kpis' | 'charts' | 'tasks' | 'insights' | 'anomalies' | 'aiSummary' | 'snapshots' | 'formulas';

export const REPORT_SECTIONS: readonly { id: ReportSection; label: string; hint: string }[] = [
  { id: 'kpis', label: 'KPI summary', hint: 'BAC, PV, EV, AC, variances, indices and forecasts' },
  { id: 'charts', label: 'Charts', hint: 'The four dashboard charts (PDF only)' },
  { id: 'tasks', label: 'Task table', hint: 'Estimated vs actual and EVM results per task' },
  { id: 'insights', label: 'Insights', hint: 'Triggered indicator rules with tips' },
  { id: 'anomalies', label: 'Unusual expenses', hint: 'Anomalies AN-01…AN-06' },
  { id: 'aiSummary', label: 'AI summary', hint: 'The last AI or offline summary' },
  { id: 'snapshots', label: 'Snapshot history', hint: 'Cumulative PV, EV, AC per status update' },
  { id: 'formulas', label: 'Formula appendix', hint: 'What each metric means (PDF only)' },
];

export const ALL_SECTIONS: ReadonlySet<ReportSection> = new Set(REPORT_SECTIONS.map((s) => s.id));

export type ValueFormat = 'money' | 'percent' | 'index';

export interface KpiRow {
  label: string;
  value: MetricValue;
  format: ValueFormat;
  /** §5 status, or null when the KPI is informational / not available. */
  status: HealthStatus | null;
}

export interface SnapshotRow {
  snapshot: StatusSnapshot;
  metrics: ProjectMetrics;
}

export interface ReportData {
  project: Project;
  generatedAt: Date;
  eacMethod: EacMethod;
  metrics: ProjectMetrics;
  health: HealthStatus | null;
  kpis: KpiRow[];
  tasks: Task[];
  taskMetrics: TaskMetrics[];
  insights: Insight[];
  anomalies: Anomaly[];
  anomaliesByTask: Map<string, Anomaly[]>;
  aiSummary: StoredSummary | null;
  aiSummaryOutOfDate: boolean;
  snapshots: SnapshotRow[];
  formulas: readonly MetricDefinition[];
  /** Reasons to double-check before exporting (shown as warnings; export is still allowed). */
  warnings: string[];
}

export const EAC_METHOD_LABEL: Record<EacMethod, string> = {
  typical: 'typical, BAC ÷ CPI',
  atypical: 'atypical, AC + (BAC − EV)',
  combined: 'combined, AC + (BAC − EV) ÷ (CPI × SPI)',
};

function kpiRows(
  m: ProjectMetrics,
  s: Record<KpiId, HealthStatus | null>,
  method: EacMethod,
): KpiRow[] {
  return [
    { label: 'Budget at completion (BAC)', value: m.bac, format: 'money', status: null },
    { label: 'Planned value (PV)', value: m.pv, format: 'money', status: null },
    { label: 'Earned value (EV)', value: m.ev, format: 'money', status: null },
    { label: 'Actual cost (AC)', value: m.ac, format: 'money', status: null },
    { label: 'Cost variance (CV)', value: m.cv, format: 'money', status: s.cv },
    { label: 'Schedule variance (SV)', value: m.sv, format: 'money', status: s.sv },
    { label: 'CV%', value: m.cvPercent, format: 'percent', status: s.cv },
    { label: 'SV%', value: m.svPercent, format: 'percent', status: s.sv },
    { label: 'Cost performance index (CPI)', value: m.cpi, format: 'index', status: s.cpi },
    { label: 'Schedule performance index (SPI)', value: m.spi, format: 'index', status: s.spi },
    {
      label: `Estimate at completion (EAC, ${EAC_METHOD_LABEL[method]})`,
      value: m.eacPrimary,
      format: 'money',
      status: s.eac,
    },
    { label: 'Estimate to complete (ETC)', value: m.etc, format: 'money', status: null },
    { label: 'Variance at completion (VAC)', value: m.vac, format: 'money', status: s.vac },
    {
      label: 'To-complete performance index (TCPI)',
      value: m.tcpi,
      format: 'index',
      status: s.tcpi,
    },
    { label: '% complete', value: m.percentComplete, format: 'percent', status: null },
    { label: '% spent', value: m.percentSpent, format: 'percent', status: null },
  ];
}

export function buildReportData(document: ProjectDocument, generatedAt: Date): ReportData {
  const { project, tasks, eacMethod } = document;
  const { statusDate, currency } = project;
  const snapshots = [...document.snapshots].sort((a, b) => a.date.localeCompare(b.date));

  const taskMetrics = tasks.map((task) => computeTaskMetrics(task, statusDate));
  const metrics = computeMetricsFromTotals(sumTaskMetrics(tasks, taskMetrics), eacMethod);
  const insights = sortInsights(
    generateInsights({ metrics, taskMetrics, tasks, snapshots, currency }),
  );
  const anomalies = sortAnomalies(detectAnomalies({ tasks, snapshots, currency }));

  const aiSummary = document.aiSummary ?? null;
  const fingerprint = summaryFingerprint(
    buildSummaryRequest({ project, tasks, taskMetrics, metrics, snapshots, anomalies }),
  );
  const aiSummaryOutOfDate = aiSummary !== null && aiSummary.fingerprint !== fingerprint;

  const warnings: string[] = [];
  if (tasks.length === 0) warnings.push('The project has no tasks, so most figures are N/A.');
  const errors = [
    ...validateTasks(tasks, { project }).errors.filter(
      (e) => tasks.length > 0 || e.ruleId !== 'VR-13',
    ),
    ...validateSnapshots(snapshots).errors,
  ];
  if (errors.length > 0) {
    warnings.push(
      `${errors.length} validation error${errors.length === 1 ? '' : 's'}: ${errors[0]!.detail ?? errors[0]!.message}`,
    );
  }
  if (aiSummaryOutOfDate) {
    warnings.push(
      'The AI summary is out of date: the project data changed after it was generated.',
    );
  }

  return {
    project,
    generatedAt,
    eacMethod,
    metrics,
    health: overallHealth(insights),
    kpis: kpiRows(metrics, kpiStatuses(metrics), eacMethod),
    tasks,
    taskMetrics,
    insights,
    anomalies,
    anomaliesByTask: groupAnomaliesByTask(anomalies),
    aiSummary,
    aiSummaryOutOfDate,
    snapshots: snapshots.map((snapshot) => ({
      snapshot,
      metrics: snapshotMetrics(snapshot, metrics.bac, eacMethod),
    })),
    formulas: METRIC_DEFINITIONS,
    warnings,
  };
}

/** "What to do" tip for an insight (FR-26). */
export function insightTip(insight: Insight): string {
  return INSIGHT_TIPS[insight.ruleId] ?? '';
}

/** "2026-04-03 14:05" in local time — for the cover page and file metadata. */
export function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Short status text so the report never relies on colour alone (NF-03). */
export function statusText(status: HealthStatus | null): string {
  switch (status) {
    case 'green':
      return 'On track';
    case 'amber':
      return 'Watch';
    case 'red':
      return 'Action needed';
    default:
      return '';
  }
}

export const INSIGHT_STATUS_TEXT: Record<Insight['status'], string> = {
  red: 'Action needed',
  amber: 'Watch',
  info: 'For information',
  green: 'Going well',
};

export const SEVERITY_TEXT: Record<Anomaly['severity'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Task-table columns shared by Excel and CSV (inputs + every computed value). */
export const TASK_EXPORT_COLUMNS = [
  { key: 'id', label: 'Task ID', kind: 'text' },
  { key: 'name', label: 'Task Name', kind: 'text' },
  { key: 'category', label: 'Category', kind: 'text' },
  { key: 'budget', label: 'Budget (estimated cost)', kind: 'money' },
  { key: 'plannedStart', label: 'Planned Start', kind: 'text' },
  { key: 'plannedFinish', label: 'Planned Finish', kind: 'text' },
  { key: 'percentComplete', label: '% Complete', kind: 'percent' },
  { key: 'actualCost', label: 'Actual Cost', kind: 'money' },
  { key: 'variance', label: 'Variance', kind: 'money' },
  { key: 'variancePercent', label: '% Variance', kind: 'percent' },
  { key: 'pv', label: 'PV', kind: 'money' },
  { key: 'ev', label: 'EV', kind: 'money' },
  { key: 'cv', label: 'CV', kind: 'money' },
  { key: 'sv', label: 'SV', kind: 'money' },
  { key: 'cpi', label: 'CPI', kind: 'index' },
  { key: 'spi', label: 'SPI', kind: 'index' },
  { key: 'anomalies', label: 'Unusual expenses', kind: 'text' },
] as const;

export type TaskExportValue = string | number | null;

/** One task as export values: numbers stay numbers, N/A stays null (FR-41, FR-42). */
export function taskExportRow(report: ReportData, index: number): TaskExportValue[] {
  const task = report.tasks[index]!;
  const m = report.taskMetrics[index]!;
  const flags = (report.anomaliesByTask.get(task.id) ?? []).map((a) => a.ruleId).join(', ');
  const values: Record<(typeof TASK_EXPORT_COLUMNS)[number]['key'], TaskExportValue> = {
    id: task.id,
    name: task.name,
    category: task.category,
    budget: task.budget,
    plannedStart: task.plannedStart,
    plannedFinish: task.plannedFinish,
    percentComplete: task.percentComplete,
    actualCost: task.actualCost,
    variance: m.variance,
    variancePercent: m.variancePercent,
    pv: m.pv,
    ev: m.ev,
    cv: m.cv,
    sv: m.sv,
    cpi: m.cpi,
    spi: m.spi,
    anomalies: flags,
  };
  return TASK_EXPORT_COLUMNS.map((c) => values[c.key]);
}
