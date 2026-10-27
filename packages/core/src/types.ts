// Domain model (PROJECT_PLAN §3) and calculation result types (§4).

export interface Project {
  id: string;
  name: string; // 1–100 chars
  currency: string; // ISO code, e.g. "PKR", "USD"
  startDate: string; // ISO date
  endDate: string; // > startDate
  statusDate: string; // current "as of" date, within [start, end + grace]
  bac?: number; // derived = sum of task budgets (read-only)
  createdAt: string;
  updatedAt: string;
}

/** One WBS work item. */
export interface Task {
  id: string; // unique within project, e.g. "1.2"
  name: string;
  category: string; // Labour | Material | Equipment | Subcontract | Other
  budget: number; // estimated cost (>= 0)
  plannedStart: string;
  plannedFinish: string; // >= plannedStart
  percentComplete: number; // 0–100
  actualCost: number; // >= 0, cumulative to status date
}

export interface TaskState {
  taskId: string;
  percentComplete: number;
  actualCost: number;
}

/** One per reporting period → progress over time. Values are cumulative. */
export interface StatusSnapshot {
  date: string;
  pv: number;
  ev: number;
  ac: number;
  taskStates?: TaskState[];
}

/** Every metric is either a finite number or null ("N/A"); never NaN or Infinity. */
export type MetricValue = number | null;

export type EacMethod = 'typical' | 'atypical' | 'combined';

/** §4.1 — per-task results. */
export interface TaskMetrics {
  taskId: string;
  estimatedCost: MetricValue;
  actualCost: MetricValue;
  variance: MetricValue; // budget − actualCost
  variancePercent: MetricValue; // variance / budget × 100
  pv: MetricValue;
  ev: MetricValue;
  cv: MetricValue;
  sv: MetricValue;
  cpi: MetricValue;
  spi: MetricValue;
}

/** Cumulative project totals that all §4.2 metrics are derived from. */
export interface EvmTotals {
  bac: MetricValue;
  pv: MetricValue;
  ev: MetricValue;
  ac: MetricValue;
}

/** §4.2 — project-level results. */
export interface ProjectMetrics extends EvmTotals {
  variance: MetricValue; // BAC − AC (simple, FR-12 total)
  variancePercent: MetricValue;
  cv: MetricValue;
  sv: MetricValue;
  cvPercent: MetricValue;
  svPercent: MetricValue;
  cpi: MetricValue;
  spi: MetricValue;
  eac: Record<EacMethod, MetricValue>;
  eacMethod: EacMethod; // primary method (FR-14)
  eacPrimary: MetricValue;
  etc: MetricValue; // based on eacPrimary
  vac: MetricValue; // based on eacPrimary
  vacPercent: MetricValue;
  tcpi: MetricValue;
  percentComplete: MetricValue;
  percentSpent: MetricValue;
}
