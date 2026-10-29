// AI summary data contract (FR-32…FR-35, SR-02, SR-08) and the offline rule-based
// fallback (FR-34, RL-05). Shared by the web app and apps/ai-proxy so both validate the
// same shapes. Only aggregated metrics, triggered insights and anomalies are ever sent.

import { z } from 'zod';
import {
  type Anomaly,
  type AnomalySeverity,
  countAnomaliesBySeverity,
  sortAnomalies,
} from './anomalies';
import { formatCurrency, formatIndex, formatNumber, formatPercent } from './format';
import {
  DEFAULT_INSIGHT_THRESHOLDS,
  generateInsights,
  type Insight,
  INSIGHT_TIPS,
  sortInsights,
} from './insights';
import type { Project, ProjectMetrics, StatusSnapshot, Task, TaskMetrics } from './types';

/** Limits that keep a request small (well under the proxy's 20 KB body limit). */
export const SUMMARY_LIMITS = Object.freeze({
  taskLabelChars: 60,
  messageChars: 400,
  maxInsights: 12,
  maxAnomalies: 25,
  summaryWords: 120,
  minRisks: 2,
  maxRisks: 4,
  recommendations: 3,
  itemChars: 400,
});

/** "A very long task name…" — trims to `max` characters including the ellipsis. */
export function truncateLabel(text: string, max: number = SUMMARY_LIMITS.taskLabelChars): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Request (web → proxy)
// ---------------------------------------------------------------------------

// Finite only (Zod rejects NaN/Infinity); 5,000 tasks × 1e12 (VR-02, VR-06) fits easily.
const metric = z.number().min(-1e18).max(1e18).nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const SummaryMetricsSchema = z
  .object({
    bac: metric,
    pv: metric,
    ev: metric,
    ac: metric,
    cv: metric,
    sv: metric,
    cvPercent: metric,
    svPercent: metric,
    cpi: metric,
    spi: metric,
    eacMethod: z.enum(['typical', 'atypical', 'combined']),
    eac: metric,
    etc: metric,
    vac: metric,
    vacPercent: metric,
    tcpi: metric,
    percentComplete: metric,
    percentSpent: metric,
  })
  .strict();

export type SummaryMetrics = z.infer<typeof SummaryMetricsSchema>;

const InsightItemSchema = z
  .object({
    ruleId: z.string().regex(/^IN-\d{2}$/),
    status: z.enum(['green', 'amber', 'red', 'info']),
    message: z.string().min(1).max(SUMMARY_LIMITS.messageChars),
  })
  .strict();

const AnomalyItemSchema = z
  .object({
    ruleId: z.string().regex(/^AN-\d{2}$/),
    severity: z.enum(['low', 'medium', 'high']),
    taskId: z.string().min(1).max(20).optional(),
    snapshotDate: isoDate.optional(),
    message: z.string().min(1).max(SUMMARY_LIMITS.messageChars),
  })
  .strict();

const count = z.number().int().min(0).max(1_000_000);

export const SummaryRequestSchema = z
  .object({
    projectName: z.string().min(1).max(100),
    currency: z.string().regex(/^[A-Z]{3}$/),
    statusDate: isoDate,
    metrics: SummaryMetricsSchema,
    insights: z.array(InsightItemSchema).max(SUMMARY_LIMITS.maxInsights),
    anomalies: z.array(AnomalyItemSchema).max(SUMMARY_LIMITS.maxAnomalies),
    anomalyCounts: z.object({ high: count, medium: count, low: count }).strict(),
  })
  .strict();

export type SummaryRequest = z.infer<typeof SummaryRequestSchema>;

export interface SummaryRequestInput {
  project: Pick<Project, 'name' | 'currency' | 'statusDate'>;
  tasks: readonly Pick<Task, 'id' | 'name'>[];
  taskMetrics: readonly TaskMetrics[];
  metrics: ProjectMetrics;
  snapshots: readonly StatusSnapshot[];
  anomalies: readonly Anomaly[];
}

function toSummaryMetrics(m: ProjectMetrics): SummaryMetrics {
  return {
    bac: m.bac,
    pv: m.pv,
    ev: m.ev,
    ac: m.ac,
    cv: m.cv,
    sv: m.sv,
    cvPercent: m.cvPercent,
    svPercent: m.svPercent,
    cpi: m.cpi,
    spi: m.spi,
    eacMethod: m.eacMethod,
    eac: m.eacPrimary,
    etc: m.etc,
    vac: m.vac,
    vacPercent: m.vacPercent,
    tcpi: m.tcpi,
    percentComplete: m.percentComplete,
    percentSpent: m.percentSpent,
  };
}

/**
 * FR-32 / SR-08: the only data sent to the AI. Insights are regenerated with task names
 * truncated to 60 characters; anomalies are sorted by severity and capped. No task table.
 */
export function buildSummaryRequest(input: SummaryRequestInput): SummaryRequest {
  const { project, metrics, anomalies } = input;
  const insights = sortInsights(
    generateInsights({
      metrics,
      taskMetrics: input.taskMetrics,
      tasks: input.tasks.map((t) => ({ id: t.id, name: truncateLabel(t.name) })),
      snapshots: input.snapshots,
      currency: project.currency,
    }),
  );
  return {
    projectName: truncateLabel(project.name, 100),
    currency: project.currency,
    statusDate: project.statusDate,
    metrics: toSummaryMetrics(metrics),
    insights: insights.slice(0, SUMMARY_LIMITS.maxInsights).map((i) => ({
      ruleId: i.ruleId,
      status: i.status,
      message: truncateLabel(i.message, SUMMARY_LIMITS.messageChars),
    })),
    anomalies: sortAnomalies(anomalies)
      .slice(0, SUMMARY_LIMITS.maxAnomalies)
      .map((a) => ({
        ruleId: a.ruleId,
        severity: a.severity,
        ...(a.taskId !== undefined && { taskId: a.taskId }),
        ...(a.snapshotDate !== undefined && { snapshotDate: a.snapshotDate }),
        message: truncateLabel(a.message, SUMMARY_LIMITS.messageChars),
      })),
    anomalyCounts: countAnomaliesBySeverity(anomalies),
  };
}

/** Stable FNV-1a hash of a request, so a stored summary can be marked "Out of date". */
export function summaryFingerprint(request: SummaryRequest): string {
  const text = JSON.stringify(request);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Response (proxy → web) and stored summary
// ---------------------------------------------------------------------------

const item = z.string().trim().min(1).max(SUMMARY_LIMITS.itemChars);

export const AiSummarySchema = z.object({
  executiveSummary: z
    .string()
    .trim()
    .min(1)
    .max(1500)
    .refine((text) => countWords(text) <= SUMMARY_LIMITS.summaryWords, {
      message: `must be at most ${SUMMARY_LIMITS.summaryWords} words`,
    }),
  keyRisks: z.array(item).min(SUMMARY_LIMITS.minRisks).max(SUMMARY_LIMITS.maxRisks),
  recommendations: z.array(item).length(SUMMARY_LIMITS.recommendations),
});

export type AiSummary = z.infer<typeof AiSummarySchema>;

/** Successful proxy response body: `{ summary, model }`. */
export const SummaryResponseSchema = z.object({
  summary: AiSummarySchema,
  model: z.string().max(100).optional(),
});

export const StoredSummarySchema = AiSummarySchema.extend({
  source: z.enum(['ai', 'offline']),
  /** Why the offline summary was used, e.g. "AI service unavailable". */
  reason: z.string().max(200).optional(),
  model: z.string().max(100).optional(),
  generatedAt: z.string().min(1).max(40),
  fingerprint: z.string().regex(/^[0-9a-f]{8}$/),
});

/** The last summary, kept with the project for the Phase 6 report (FR-40). */
export type StoredSummary = z.infer<typeof StoredSummarySchema>;

// ---------------------------------------------------------------------------
// Offline rule-based summary (FR-34)
// ---------------------------------------------------------------------------

type SummaryAnomaly = Pick<Anomaly, 'ruleId' | 'severity' | 'message'>;

export interface OfflineSummaryOptions {
  currency?: string;
  projectName?: string;
  statusDate?: string;
  /** Full counts when `anomalies` is a capped list. */
  anomalyCounts?: Record<AnomalySeverity, number>;
}

type OfflineMetrics = Pick<
  SummaryMetrics,
  'bac' | 'cpi' | 'spi' | 'eac' | 'vac' | 'vacPercent' | 'percentComplete' | 'percentSpent'
>;

const GENERIC_RECOMMENDATIONS = [
  'Record status at every reporting period so cost and schedule trends are spotted early.',
  'Review the dashboard each period and agree actions for any task that is over budget.',
  'Share this summary with stakeholders and confirm the forecast at completion with them.',
];

function indexSentence(kind: 'Cost' | 'Schedule', value: number | null): string {
  const name = kind === 'Cost' ? 'CPI' : 'SPI';
  if (value === null) return `${kind} performance cannot be measured yet.`;
  const t = DEFAULT_INSIGHT_THRESHOLDS;
  const shown = `${name} ${formatIndex(value)}`;
  if (kind === 'Cost') {
    if (value >= t.indexOnTarget) return `Cost performance is on target (${shown}).`;
    if (value >= t.indexWarning) return `The project is slightly over budget (${shown}).`;
    return `The project is significantly over budget (${shown}).`;
  }
  if (value >= t.indexOnTarget) return `Work is on or ahead of schedule (${shown}).`;
  if (value >= t.indexWarning) return `Work is slightly behind schedule (${shown}).`;
  return `Work is significantly behind schedule (${shown}).`;
}

function uniquePush(list: string[], value: string | undefined, max: number): void {
  if (value && list.length < max && !list.includes(value)) list.push(value);
}

/**
 * FR-34: the same three sections as the AI summary, written from the insight rules and
 * anomalies with templates. Works with no network and never throws on missing metrics.
 */
export function buildOfflineSummary(
  metrics: OfflineMetrics,
  insights: readonly Insight[],
  anomalies: readonly SummaryAnomaly[],
  options: OfflineSummaryOptions = {},
): AiSummary {
  const money = (value: number | null) =>
    options.currency ? formatCurrency(value, options.currency) : formatNumber(value);
  const name = options.projectName ? truncateLabel(options.projectName, 60) : 'The project';
  const counts = options.anomalyCounts ?? countAnomaliesBySeverity(anomalies);
  const totalAnomalies = counts.high + counts.medium + counts.low;
  const sorted = sortInsights(insights);

  // Executive summary
  const sentences: string[] = [];
  if (metrics.percentComplete === null || metrics.bac === null) {
    sentences.push(
      `There is not enough data yet to assess ${name}: add tasks with budgets, progress and actual costs.`,
    );
  } else {
    const asOf = options.statusDate ? ` as of ${options.statusDate}` : '';
    sentences.push(
      `${name} is ${formatPercent(metrics.percentComplete)} complete and has spent ${formatPercent(metrics.percentSpent)} of its ${money(metrics.bac)} budget${asOf}.`,
    );
    sentences.push(indexSentence('Cost', metrics.cpi), indexSentence('Schedule', metrics.spi));
    if (metrics.eac !== null && metrics.vac !== null) {
      sentences.push(
        metrics.vac < 0
          ? `The forecast at completion is ${money(metrics.eac)}, an overrun of ${money(Math.abs(metrics.vac))}${metrics.vacPercent === null ? '' : ` (${formatPercent(Math.abs(metrics.vacPercent))})`}.`
          : `The forecast at completion is ${money(metrics.eac)}, within budget by ${money(metrics.vac)}.`,
      );
    }
  }
  sentences.push(
    totalAnomalies === 0
      ? 'No unusual expenses were flagged.'
      : `${totalAnomalies} unusual expense${totalAnomalies === 1 ? ' was' : 's were'} flagged (${counts.high} high severity).`,
  );

  // Key risks: red and amber insights, then high and medium anomalies
  const risks: string[] = [];
  for (const insight of sorted) {
    if (insight.status === 'red' || insight.status === 'amber')
      uniquePush(risks, insight.message, SUMMARY_LIMITS.maxRisks);
  }
  for (const anomaly of sortAnomalies(anomalies)) {
    if (anomaly.severity !== 'low') uniquePush(risks, anomaly.message, SUMMARY_LIMITS.maxRisks);
  }
  if (risks.length === 0)
    risks.push('No cost or schedule risks were flagged by the indicator rules.');
  if (risks.length < SUMMARY_LIMITS.minRisks)
    risks.push(
      'This assessment only uses the data entered; keep recording status to spot trends early.',
    );

  // Recommendations: tips for the triggered rules (most serious first), then anomaly and generic tips
  const recommendations: string[] = [];
  const max = SUMMARY_LIMITS.recommendations;
  const tip = (insight: Insight) => uniquePush(recommendations, INSIGHT_TIPS[insight.ruleId], max);
  sorted.filter((i) => i.status !== 'green').forEach(tip);
  if (totalAnomalies > 0) {
    uniquePush(
      recommendations,
      `Check the ${totalAnomalies} unusual expense${totalAnomalies === 1 ? '' : 's'} listed on the Insights page and correct any data errors.`,
      max,
    );
  }
  sorted.filter((i) => i.status === 'green').forEach(tip);
  for (const generic of GENERIC_RECOMMENDATIONS) uniquePush(recommendations, generic, max);

  return {
    executiveSummary: sentences.join(' '),
    keyRisks: risks.map((r) => truncateLabel(r, SUMMARY_LIMITS.itemChars)),
    recommendations,
  };
}
