// Zod schemas + business rules VR-01…VR-16 (PROJECT_PLAN §7).
//
// Every check reports a ValidationIssue with the rule ID, row/column where known,
// and a user-readable message such as
//   "Row 14, '% Complete': value 120 must be between 0 and 100".
// Errors block import/calculation; warnings are shown but allowed.
// Row numbers are spreadsheet rows: the header is row 1, the first data row is row 2.

import { z } from 'zod';
import { formatNumber } from './format';
import {
  type ColumnSpec,
  type HeaderMapping,
  type ParsedPercent,
  isBlank,
  looksLikeFormula,
  looksLikeFractions,
  mapHeaders,
  parseDate,
  parseNumber,
  parsePercent,
  sanitizeText,
} from './parsers';
import { parseIsoDate } from './pv';
import type { Project, StatusSnapshot, Task } from './types';

export const VALIDATION_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024, // VR-02
  maxRows: 5_000, // VR-02
  maxAmount: 1e12, // VR-06
  taskIdMaxLength: 20, // VR-04
  nameMaxLength: 100, // VR-05
  categoryMaxLength: 50, // VR-16
} as const;

export const TASK_CATEGORIES = ['Labour', 'Material', 'Equipment', 'Subcontract', 'Other'] as const;

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  ruleId: string;
  severity: IssueSeverity;
  /** Full message including the location, e.g. "Row 3, 'Budget': value -5 must be …". */
  message: string;
  /** The message without the row/column prefix, for display next to a form field. */
  detail?: string;
  row?: number;
  column?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

interface Location {
  row?: number;
  column?: string;
}

function locate(loc: Location, text: string): string {
  const parts: string[] = [];
  if (loc.row !== undefined) parts.push(`Row ${loc.row}`);
  if (loc.column !== undefined) parts.push(`'${loc.column}'`);
  return parts.length > 0 ? `${parts.join(', ')}: ${text}` : text[0]!.toUpperCase() + text.slice(1);
}

class Issues {
  readonly errors: ValidationIssue[] = [];
  readonly warnings: ValidationIssue[] = [];

  error(ruleId: string, text: string, loc: Location = {}): void {
    this.errors.push({
      ruleId,
      severity: 'error',
      message: locate(loc, text),
      detail: text,
      ...loc,
    });
  }

  warning(ruleId: string, text: string, loc: Location = {}): void {
    this.warnings.push({
      ruleId,
      severity: 'warning',
      message: locate(loc, text),
      detail: text,
      ...loc,
    });
  }

  get hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /** Issues sorted by row (file-level issues first); order within a row is kept. */
  result(): ValidationResult {
    const byRow = (a: ValidationIssue, b: ValidationIssue) => (a.row ?? 0) - (b.row ?? 0);
    return {
      valid: this.errors.length === 0,
      errors: [...this.errors].sort(byRow),
      warnings: [...this.warnings].sort(byRow),
    };
  }
}

/** How a cell value is quoted in messages: numbers and dates bare, text in quotes. */
function describeValue(raw: unknown): string {
  if (raw instanceof Date)
    return Number.isNaN(raw.getTime()) ? '"Invalid Date"' : raw.toISOString().slice(0, 10);
  if (typeof raw === 'number') return String(raw);
  const text = sanitizeText(raw, 40).value;
  return /^[-+]?[\d.,/-]+%?$/.test(text) ? text : `"${text}"`;
}

function valueProblem(raw: unknown, problem: string): string {
  return problem === 'is required' || isBlank(raw)
    ? 'a value is required'
    : `value ${describeValue(raw)} ${problem}`;
}

// ---------------------------------------------------------------------------
// Zod schemas (typed objects: forms, .evm.json files, parsed rows)
// ---------------------------------------------------------------------------

const DATE_MESSAGE = 'is not a valid date (use YYYY-MM-DD)';
const amountMessage = { message: 'must be between 0 and 1,000,000,000,000' };
const percentMessage = { message: 'must be between 0 and 100' };

const isoDate = z
  .string()
  .refine((value) => parseIsoDate(value) !== null, { message: DATE_MESSAGE });
const amount = z
  .number({ message: 'must be a number' })
  .min(0, amountMessage)
  .max(VALIDATION_LIMITS.maxAmount, amountMessage);
const percent = z
  .number({ message: 'must be a number' })
  .min(0, percentMessage)
  .max(100, percentMessage);
const requiredText = (max: number) =>
  z
    .string({ message: 'is required' })
    .trim()
    .min(1, { message: 'is required' })
    .max(max, { message: `must be at most ${max} characters` });

const TaskFields = z.object({
  id: requiredText(VALIDATION_LIMITS.taskIdMaxLength),
  name: requiredText(VALIDATION_LIMITS.nameMaxLength),
  category: z
    .string({ message: 'must be text' })
    .max(VALIDATION_LIMITS.categoryMaxLength, { message: 'must be at most 50 characters' }),
  budget: amount,
  plannedStart: isoDate,
  plannedFinish: isoDate,
  percentComplete: percent,
  actualCost: amount,
});

export const TaskSchema = TaskFields.superRefine((task, ctx) => {
  const start = parseIsoDate(task.plannedStart);
  const finish = parseIsoDate(task.plannedFinish);
  if (start !== null && finish !== null && finish < start) {
    ctx.addIssue({
      code: 'custom',
      path: ['plannedFinish'],
      message: `must be on or after the planned start (${task.plannedStart})`,
    });
  }
});

const ProjectFields = z.object({
  id: z.string().min(1),
  name: requiredText(VALIDATION_LIMITS.nameMaxLength),
  currency: z
    .string({ message: 'is required' })
    .regex(/^[A-Z]{3}$/, { message: 'must be a 3-letter ISO currency code such as USD or PKR' }),
  startDate: isoDate,
  endDate: isoDate,
  statusDate: isoDate,
  bac: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** VR-09: end > start; status date ≥ start. */
function projectDateRules(
  project: Pick<Project, 'startDate' | 'endDate' | 'statusDate'>,
  ctx: z.RefinementCtx,
): void {
  const start = parseIsoDate(project.startDate);
  const end = parseIsoDate(project.endDate);
  const status = parseIsoDate(project.statusDate);
  if (start === null) return;
  if (end !== null && end <= start) {
    ctx.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: `must be after the start date (${project.startDate})`,
      params: { ruleId: 'VR-09' },
    });
  }
  if (status !== null && status < start) {
    ctx.addIssue({
      code: 'custom',
      path: ['statusDate'],
      message: `must be on or after the start date (${project.startDate})`,
      params: { ruleId: 'VR-09' },
    });
  }
}

export const ProjectSchema = ProjectFields.superRefine(projectDateRules);

export type ProjectInput = Pick<
  Project,
  'name' | 'currency' | 'startDate' | 'endDate' | 'statusDate'
>;

/** The user-entered project fields (form, Project sheet). */
export const ProjectInputSchema = ProjectFields.pick({
  name: true,
  currency: true,
  startDate: true,
  endDate: true,
  statusDate: true,
}).superRefine(projectDateRules);

export const TaskStateSchema = z.object({
  taskId: requiredText(VALIDATION_LIMITS.taskIdMaxLength),
  percentComplete: percent,
  actualCost: amount,
});

export const StatusSnapshotSchema = z.object({
  date: isoDate,
  pv: amount,
  ev: amount,
  ac: amount,
  taskStates: z.array(TaskStateSchema).optional(),
});

/** Copies Zod issues into the issue list, mapping each field to its rule ID and column label. */
function addZodIssues<F extends string>(
  error: z.ZodError,
  rules: Record<F, string>,
  issues: Issues,
  locate: (field: F) => Location,
  raw: (field: F) => unknown,
): void {
  for (const issue of error.issues) {
    if (issue.path.length === 0) {
      // The value itself is not an object (e.g. a string where a task was expected).
      const { row } = locate(Object.keys(rules)[0] as F);
      issues.error('VR-03', 'the entry is not a valid record', { row });
      continue;
    }
    const field = String(issue.path[0]) as F;
    const override = (issue as { params?: { ruleId?: string } }).params?.ruleId;
    issues.error(
      override ?? rules[field] ?? 'VR-03',
      valueProblem(raw(field), issue.message),
      locate(field),
    );
  }
}

// ---------------------------------------------------------------------------
// Column definitions (FR-06)
// ---------------------------------------------------------------------------

export type TaskField = keyof Task;
export type PeriodField = 'date' | 'pv' | 'ev' | 'ac';
export type ProjectField = keyof ProjectInput;

export const TASK_COLUMNS: readonly ColumnSpec<TaskField>[] = [
  { field: 'id', label: 'Task ID', required: true, aliases: ['ID', 'WBS', 'WBS ID'] },
  { field: 'name', label: 'Task Name', required: true, aliases: ['Name', 'Task', 'Description'] },
  { field: 'category', label: 'Category', required: false, aliases: ['Cost Category', 'Type'] },
  { field: 'budget', label: 'Budget', required: true, aliases: ['Estimated Cost', 'Planned Cost'] },
  {
    field: 'plannedStart',
    label: 'Planned Start',
    required: true,
    aliases: ['Start', 'Start Date'],
  },
  {
    field: 'plannedFinish',
    label: 'Planned Finish',
    required: true,
    aliases: ['Finish', 'Finish Date', 'Planned End', 'End', 'End Date'],
  },
  {
    field: 'percentComplete',
    label: '% Complete',
    required: true,
    aliases: ['Percent Complete', 'Pct Complete', 'Complete', 'Progress'],
  },
  {
    field: 'actualCost',
    label: 'Actual Cost',
    required: true,
    aliases: ['Actual', 'AC', 'Cost to Date'],
  },
];

export const PERIOD_COLUMNS: readonly ColumnSpec<PeriodField>[] = [
  {
    field: 'date',
    label: 'Date',
    required: true,
    aliases: ['Status Date', 'Period', 'Period End'],
  },
  { field: 'pv', label: 'PV', required: true, aliases: ['Planned Value'] },
  { field: 'ev', label: 'EV', required: true, aliases: ['Earned Value'] },
  { field: 'ac', label: 'AC', required: true, aliases: ['Actual Cost'] },
];

export const PROJECT_COLUMNS: readonly ColumnSpec<ProjectField>[] = [
  { field: 'name', label: 'Name', required: true, aliases: ['Project', 'Project Name'] },
  { field: 'currency', label: 'Currency', required: true },
  { field: 'startDate', label: 'Start Date', required: true, aliases: ['Start'] },
  {
    field: 'endDate',
    label: 'End Date',
    required: true,
    aliases: ['End', 'Finish', 'Finish Date'],
  },
  {
    field: 'statusDate',
    label: 'Status Date',
    required: true,
    aliases: ['As Of', 'As Of Date', 'Data Date'],
  },
];

const TASK_RULES: Record<TaskField, string> = {
  id: 'VR-04',
  name: 'VR-05',
  category: 'VR-16',
  budget: 'VR-06',
  plannedStart: 'VR-08',
  plannedFinish: 'VR-08',
  percentComplete: 'VR-07',
  actualCost: 'VR-06',
};

const PERIOD_RULES: Record<PeriodField, string> = {
  date: 'VR-08',
  pv: 'VR-06',
  ev: 'VR-06',
  ac: 'VR-06',
};

const PROJECT_RULES: Record<ProjectField, string> = {
  name: 'FR-01',
  currency: 'FR-01',
  startDate: 'VR-08',
  endDate: 'VR-08',
  statusDate: 'VR-08',
};

function labels<F extends string>(specs: readonly ColumnSpec<F>[]): Record<F, string> {
  return Object.fromEntries(specs.map((spec) => [spec.field, spec.label])) as Record<F, string>;
}

const TASK_LABELS = labels(TASK_COLUMNS);
const PERIOD_LABELS = labels(PERIOD_COLUMNS);
const PROJECT_LABELS = labels(PROJECT_COLUMNS);

/** Maps "labour" → "Labour"; blank → "Other"; unknown categories are kept as written. */
export function normalizeCategory(text: string): string {
  if (text === '') return 'Other';
  return TASK_CATEGORIES.find((c) => c.toLowerCase() === text.toLowerCase()) ?? text;
}

// ---------------------------------------------------------------------------
// VR-01, VR-02: file checks (before reading the contents)
// ---------------------------------------------------------------------------

const ALLOWED_MIME: Record<'csv' | 'xlsx', readonly string[]> = {
  csv: [
    'text/csv',
    'application/csv',
    'text/x-csv',
    'application/x-csv',
    'text/comma-separated-values',
    'text/plain',
    'application/vnd.ms-excel', // what Windows reports for .csv when Excel is installed
  ],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
    'application/zip',
  ],
};

export interface FileMeta {
  name: string;
  size: number; // bytes
  type?: string; // MIME type reported by the browser/OS; may be empty
}

export function validateFileMeta(file: FileMeta): ValidationResult {
  const issues = new Issues();
  const extension = /\.([^.]+)$/.exec(file.name.toLowerCase())?.[1];

  if (extension !== 'csv' && extension !== 'xlsx') {
    issues.error('VR-01', `File "${file.name}" is not supported. Upload a .csv or .xlsx file.`);
  } else if (file.type && !ALLOWED_MIME[extension].includes(file.type.toLowerCase())) {
    issues.error(
      'VR-01',
      `File "${file.name}" reports type "${file.type}", which does not match a .${extension} file.`,
    );
  }

  if (file.size === 0) {
    issues.error('VR-15', `File "${file.name}" is empty.`);
  } else if (file.size > VALIDATION_LIMITS.maxFileBytes) {
    const mb = formatNumber(file.size / (1024 * 1024), 1);
    issues.error('VR-02', `File "${file.name}" is ${mb} MB; the maximum is 5 MB.`);
  }
  return issues.result();
}

// ---------------------------------------------------------------------------
// Sheet rows (CSV / Excel)
// ---------------------------------------------------------------------------

/** A sheet as read from CSV or Excel: the header row and the data rows below it. */
export interface SheetData {
  headers: readonly unknown[];
  rows: readonly (readonly unknown[])[];
}

export interface SheetOptions {
  /** Spreadsheet row number of the header row (default 1). */
  headerRowNumber?: number;
}

interface SheetRow {
  row: number;
  cells: readonly unknown[];
}

/** VR-15 (empty file / skip blank rows) and VR-02 (row limit). Returns null if nothing can be read. */
function collectRows(sheet: SheetData, issues: Issues, options: SheetOptions): SheetRow[] | null {
  const headerRow = options.headerRowNumber ?? 1;
  if (sheet.headers.every(isBlank) && sheet.rows.every((cells) => cells.every(isBlank))) {
    issues.error('VR-15', 'The file is empty.');
    return null;
  }
  const rows = sheet.rows
    .map((cells, index) => ({ row: headerRow + 1 + index, cells }))
    .filter(({ cells }) => !cells.every(isBlank));
  if (rows.length === 0) {
    issues.error('VR-15', 'The file has a header row but no data rows.');
    return null;
  }
  if (rows.length > VALIDATION_LIMITS.maxRows) {
    issues.error(
      'VR-02',
      `The file has ${formatNumber(rows.length, 0)} data rows; the maximum is ${formatNumber(VALIDATION_LIMITS.maxRows, 0)}.`,
    );
    return null;
  }
  return rows;
}

/** VR-03: every required column is present. */
function checkHeaders<F extends string>(mapping: HeaderMapping<F>, issues: Issues): void {
  for (const spec of mapping.missing) {
    issues.errors.push({
      ruleId: 'VR-03',
      severity: 'error',
      message: `Missing required column '${spec.label}'.`,
      detail: 'required column is missing',
      column: spec.label,
    });
  }
  for (const header of mapping.duplicates) {
    issues.warning(
      'VR-03',
      `Column '${header}' appears more than once; only the first one is used.`,
    );
  }
}

/** Reads cells by field and reports parse failures with row/column. */
class RowReader<F extends string> {
  failed = false;

  constructor(
    private readonly sheetRow: { row?: number; cells: readonly unknown[] },
    private readonly mapping: HeaderMapping<F>,
    private readonly labels: Record<F, string>,
    private readonly rules: Record<F, string>,
    private readonly issues: Issues,
  ) {}

  raw(field: F): unknown {
    const index = this.mapping.columns[field];
    return index === undefined ? undefined : this.sheetRow.cells[index];
  }

  loc(field: F): Location {
    return { row: this.sheetRow.row, column: this.mapping.headers[field] ?? this.labels[field] };
  }

  private parsed<T>(
    field: F,
    result: { ok: true; value: T } | { ok: false; reason: string },
  ): T | undefined {
    if (result.ok) return result.value;
    this.failed = true;
    this.issues.error(
      this.rules[field],
      valueProblem(this.raw(field), result.reason),
      this.loc(field),
    );
    return undefined;
  }

  number(field: F): number | undefined {
    return this.parsed(field, parseNumber(this.raw(field)));
  }

  percent(field: F): ParsedPercent | undefined {
    return this.parsed(field, parsePercent(this.raw(field)));
  }

  date(field: F): string | undefined {
    return this.parsed(field, parseDate(this.raw(field)));
  }

  /** VR-16: plain text with control characters removed; formula-like text is flagged. */
  text(field: F, maxLength?: number): string {
    const raw = this.raw(field);
    const clean = sanitizeText(raw, maxLength);
    if (looksLikeFormula(raw)) {
      this.issues.warning(
        'VR-16',
        'text starts with a formula character (=, +, -, @) and will be stored as plain text, not run as a formula',
        this.loc(field),
      );
    } else if (clean.changed) {
      this.issues.warning('VR-16', 'hidden control characters were removed', this.loc(field));
    }
    return clean.value;
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

type ProjectDates = Pick<Project, 'startDate' | 'endDate'>;

interface TaskContext {
  row?: number;
  locate: (field: TaskField) => Location;
  raw: (field: TaskField) => unknown;
  project?: ProjectDates;
}

/** VR-10, VR-11, VR-12 — warnings for an otherwise valid task. */
function taskWarnings(task: Task, ctx: TaskContext, issues: Issues): void {
  const projectStart = ctx.project ? parseIsoDate(ctx.project.startDate) : null;
  const projectEnd = ctx.project ? parseIsoDate(ctx.project.endDate) : null;
  if (ctx.project && projectStart !== null && projectEnd !== null) {
    const start = parseIsoDate(task.plannedStart)!;
    const finish = parseIsoDate(task.plannedFinish)!;
    if (start < projectStart || finish > projectEnd) {
      issues.warning(
        'VR-10',
        `planned dates ${task.plannedStart} → ${task.plannedFinish} fall outside the project dates (${ctx.project.startDate} → ${ctx.project.endDate})`,
        { row: ctx.row },
      );
    }
  }
  if (task.budget === 0) {
    issues.warning(
      'VR-11',
      'budget is 0, so this task adds no planned or earned value',
      ctx.locate('budget'),
    );
  }
  if (task.actualCost > 0 && task.percentComplete === 0) {
    const percentColumn = ctx.locate('percentComplete').column;
    issues.warning(
      'VR-12',
      `actual cost ${formatNumber(task.actualCost)} has been spent but '${percentColumn}' is 0`,
      ctx.locate('actualCost'),
    );
  }
}

/** Schema check + warnings for one task candidate. Returns the typed task, or null on error. */
function checkTask(candidate: unknown, ctx: TaskContext, issues: Issues): Task | null {
  const parsed = TaskSchema.safeParse(candidate);
  if (!parsed.success) {
    addZodIssues(parsed.error, TASK_RULES, issues, ctx.locate, ctx.raw);
    return null;
  }
  taskWarnings(parsed.data, ctx, issues);
  return parsed.data;
}

/**
 * For a row where some cells could not be parsed: still apply the schema rules (ranges,
 * lengths) to the cells that did parse, so every problem in the row is listed at once.
 */
function reportParsedFieldIssues(
  candidate: Record<string, unknown>,
  ctx: TaskContext,
  issues: Issues,
): void {
  const parsed = TaskSchema.safeParse(candidate);
  if (parsed.success) return;
  const relevant = parsed.error.issues.filter(
    (issue) => issue.path.length > 0 && candidate[String(issue.path[0])] !== undefined,
  );
  if (relevant.length > 0) {
    addZodIssues(new z.ZodError(relevant), TASK_RULES, issues, ctx.locate, ctx.raw);
  }
}

/** VR-04 duplicate check. Returns false (and reports) when the ID was already used. */
function claimId(
  seen: Map<string, number | undefined>,
  id: string,
  ctx: TaskContext,
  issues: Issues,
): boolean {
  if (!seen.has(id)) {
    seen.set(id, ctx.row);
    return true;
  }
  const first = seen.get(id);
  issues.error(
    'VR-04',
    `value "${id}" is already used${first !== undefined ? ` in row ${first}` : ''}; Task IDs must be unique`,
    ctx.locate('id'),
  );
  return false;
}

/** VR-13: total budget must be > 0. */
function checkBac(tasks: readonly Task[], issues: Issues): void {
  const bac = tasks.reduce((sum, task) => sum + task.budget, 0);
  if (!(bac > 0)) {
    issues.error(
      'VR-13',
      'Total budget (BAC) is 0. At least one task needs a budget above 0 to calculate EVM metrics.',
    );
  }
}

export interface TaskValidationOptions {
  /** Project dates for VR-10 warnings. */
  project?: ProjectDates;
}

function objectContext(
  task: unknown,
  row: number | undefined,
  options: TaskValidationOptions,
): TaskContext {
  const record = (typeof task === 'object' && task !== null ? task : {}) as Record<string, unknown>;
  return {
    row,
    locate: (field) => ({ row, column: TASK_LABELS[field] }),
    raw: (field) => record[field],
    project: options.project,
  };
}

/** Validates one task object (e.g. inline form validation, FR-02). */
export function validateTask(
  task: unknown,
  options: TaskValidationOptions = {},
): ValidationResult & { task: Task | null } {
  const issues = new Issues();
  const valid = checkTask(task, objectContext(task, undefined, options), issues);
  return { ...issues.result(), task: valid };
}

/**
 * Validates a whole task list (e.g. a loaded .evm.json file or the editable table),
 * including duplicate IDs (VR-04) and BAC > 0 (VR-13). Row = position in the list, from 1.
 */
export function validateTasks(
  tasks: readonly unknown[],
  options: TaskValidationOptions = {},
): ValidationResult & { tasks: Task[] } {
  const issues = new Issues();
  const seen = new Map<string, number | undefined>();
  const valid: Task[] = [];
  tasks.forEach((candidate, index) => {
    const ctx = objectContext(candidate, index + 1, options);
    const task = checkTask(candidate, ctx, issues);
    if (task && claimId(seen, task.id, ctx, issues)) valid.push(task);
  });
  if (!issues.hasErrors) checkBac(valid, issues);
  return { ...issues.result(), tasks: valid };
}

export interface TaskImportOptions extends SheetOptions, TaskValidationOptions {
  /**
   * VR-07: how to read % Complete values without a "%" sign.
   * true → fractions (0.45 = 45%); false → percentages; undefined → percentages, with a
   * warning and `percentFractionSuspected` set if every value is ≤ 1 so the UI can ask.
   */
  percentAsFraction?: boolean;
}

export interface TaskImportResult extends ValidationResult {
  /** Tasks from rows without errors (every row when `valid`). */
  tasks: Task[];
  /** Non-empty data rows read. */
  rowCount: number;
  /** VR-07: every % Complete value is ≤ 1 — ask the user whether they are fractions. */
  percentFractionSuspected: boolean;
  mapping: HeaderMapping<TaskField>;
}

/** Validates the Tasks sheet / CSV (VR-02…VR-08, VR-10…VR-13, VR-15, VR-16). */
export function validateTaskRows(
  sheet: SheetData,
  options: TaskImportOptions = {},
): TaskImportResult {
  const issues = new Issues();
  const mapping = mapHeaders(
    sheet.headers.map((header) => sanitizeText(header).value),
    TASK_COLUMNS,
  );
  const done = (
    tasks: Task[] = [],
    rowCount = 0,
    percentFractionSuspected = false,
  ): TaskImportResult => ({
    ...issues.result(),
    tasks,
    rowCount,
    percentFractionSuspected,
    mapping,
  });

  const rows = collectRows(sheet, issues, options);
  if (rows === null) return done();
  checkHeaders(mapping, issues);
  if (issues.hasErrors) return done([], rows.length);

  // Pass 1: parse every cell and check for duplicate IDs (VR-04), so a row with several
  // problems reports all of them at once.
  const seen = new Map<string, number | undefined>();
  const parsedRows = rows.map((sheetRow) => {
    const reader = new RowReader(sheetRow, mapping, TASK_LABELS, TASK_RULES, issues);
    const ctx: TaskContext = {
      row: sheetRow.row,
      locate: (field) => reader.loc(field),
      raw: (field) => reader.raw(field),
      project: options.project,
    };
    const fields = {
      id: reader.text('id'),
      name: reader.text('name'),
      category: normalizeCategory(reader.text('category', VALIDATION_LIMITS.categoryMaxLength)),
      budget: reader.number('budget'),
      plannedStart: reader.date('plannedStart'),
      plannedFinish: reader.date('plannedFinish'),
      percent: reader.percent('percentComplete'),
      actualCost: reader.number('actualCost'),
    };
    const duplicate = fields.id !== '' && !claimId(seen, fields.id, ctx, issues);
    return { reader, ctx, fields, duplicate };
  });

  // VR-07: decide how to scale % Complete.
  const percents = parsedRows.flatMap(({ fields }) => (fields.percent ? [fields.percent] : []));
  const suspected = looksLikeFractions(percents);
  if (suspected && options.percentAsFraction === undefined) {
    const column = mapping.headers.percentComplete ?? TASK_LABELS.percentComplete;
    issues.warning(
      'VR-07',
      `All '${column}' values are between 0 and 1. If they are fractions (0.45 = 45%), confirm to convert them; otherwise they are read as percentages (0.45%).`,
      { column },
    );
  }
  const scale = (p: ParsedPercent) =>
    p.hadPercentSign || !options.percentAsFraction
      ? p.value
      : Number((p.value * 100).toPrecision(12));

  // Pass 2: business rules on rows that parsed cleanly. Duplicate rows are still checked
  // (so all their problems are listed) but never imported.
  const tasks: Task[] = [];
  for (const { reader, ctx, fields, duplicate } of parsedRows) {
    const { percent, ...rest } = fields;
    const candidate = { ...rest, percentComplete: percent ? scale(percent) : undefined };
    if (reader.failed) {
      reportParsedFieldIssues(candidate, ctx, issues);
      continue;
    }
    const task = checkTask(candidate, ctx, issues);
    if (task && !duplicate) tasks.push(task);
  }

  if (!issues.hasErrors) checkBac(tasks, issues);
  return done(tasks, rows.length, suspected);
}

// ---------------------------------------------------------------------------
// Snapshots / Periods sheet
// ---------------------------------------------------------------------------

/** VR-14: dates unique and ascending; cumulative EV and AC never decrease. */
function snapshotWarnings(
  snapshots: readonly { snapshot: StatusSnapshot; row: number | undefined }[],
  issues: Issues,
): void {
  const seenDates = new Set<string>();
  snapshots.forEach(({ snapshot, row }, index) => {
    if (seenDates.has(snapshot.date)) {
      issues.warning('VR-14', `snapshot date ${snapshot.date} appears more than once`, { row });
    }
    seenDates.add(snapshot.date);

    const previous = snapshots[index - 1]?.snapshot;
    if (!previous) return;
    if (snapshot.date < previous.date) {
      issues.warning(
        'VR-14',
        `snapshot date ${snapshot.date} is earlier than the previous snapshot (${previous.date}); dates should be in ascending order`,
        { row },
      );
    }
    for (const key of ['ev', 'ac'] as const) {
      if (snapshot[key] < previous[key]) {
        issues.warning(
          'VR-14',
          `cumulative ${key.toUpperCase()} fell from ${formatNumber(previous[key])} to ${formatNumber(snapshot[key])}; cumulative values should never decrease`,
          { row },
        );
      }
    }
  });
}

/** Validates snapshot objects (schema + VR-14). Row = position in the list, from 1. */
export function validateSnapshots(
  snapshots: readonly unknown[],
): ValidationResult & { snapshots: StatusSnapshot[] } {
  const issues = new Issues();
  const valid: { snapshot: StatusSnapshot; row: number }[] = [];
  snapshots.forEach((candidate, index) => {
    const row = index + 1;
    const record = (typeof candidate === 'object' && candidate !== null ? candidate : {}) as Record<
      string,
      unknown
    >;
    const parsed = StatusSnapshotSchema.safeParse(candidate);
    if (parsed.success) valid.push({ snapshot: parsed.data, row });
    else
      addZodIssues(
        parsed.error,
        { ...PERIOD_RULES, taskStates: 'VR-14' } as Record<string, string>,
        issues,
        (field) => ({ row, column: PERIOD_LABELS[field as PeriodField] ?? field }),
        (field) => record[field],
      );
  });
  snapshotWarnings(valid, issues);
  return { ...issues.result(), snapshots: valid.map((v) => v.snapshot) };
}

export interface PeriodImportResult extends ValidationResult {
  snapshots: StatusSnapshot[];
  rowCount: number;
  mapping: HeaderMapping<PeriodField>;
}

/** Validates the optional Periods sheet / CSV (Date, PV, EV, AC — cumulative). */
export function validatePeriodRows(
  sheet: SheetData,
  options: SheetOptions = {},
): PeriodImportResult {
  const issues = new Issues();
  const mapping = mapHeaders(
    sheet.headers.map((header) => sanitizeText(header).value),
    PERIOD_COLUMNS,
  );
  const done = (snapshots: StatusSnapshot[] = [], rowCount = 0): PeriodImportResult => ({
    ...issues.result(),
    snapshots,
    rowCount,
    mapping,
  });

  const rows = collectRows(sheet, issues, options);
  if (rows === null) return done();
  checkHeaders(mapping, issues);
  if (issues.hasErrors) return done([], rows.length);

  const valid: { snapshot: StatusSnapshot; row: number }[] = [];
  for (const sheetRow of rows) {
    const reader = new RowReader(sheetRow, mapping, PERIOD_LABELS, PERIOD_RULES, issues);
    const candidate = {
      date: reader.date('date'),
      pv: reader.number('pv'),
      ev: reader.number('ev'),
      ac: reader.number('ac'),
    };
    if (reader.failed) continue;
    const parsed = StatusSnapshotSchema.safeParse(candidate);
    if (parsed.success) valid.push({ snapshot: parsed.data, row: sheetRow.row });
    else
      addZodIssues(
        parsed.error,
        PERIOD_RULES,
        issues,
        (field) => reader.loc(field),
        (field) => reader.raw(field),
      );
  }
  snapshotWarnings(valid, issues);
  return done(
    valid.map((v) => v.snapshot),
    rows.length,
  );
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

/** Validates the user-entered project fields (form, FR-01): VR-08, VR-09. */
export function validateProject(
  input: unknown,
): ValidationResult & { project: ProjectInput | null } {
  const issues = new Issues();
  const record = (typeof input === 'object' && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  const parsed = ProjectInputSchema.safeParse(input);
  if (!parsed.success) {
    addZodIssues(
      parsed.error,
      PROJECT_RULES,
      issues,
      (field) => ({ column: PROJECT_LABELS[field] }),
      (field) => record[field],
    );
  }
  return { ...issues.result(), project: parsed.success ? parsed.data : null };
}

/**
 * Reads a Project sheet given as label → value pairs (e.g. { "Name": "…", "Start Date": 46027 }).
 * Labels are matched tolerantly; dates accept every format parseDate does.
 */
export function parseProjectRecord(
  record: Readonly<Record<string, unknown>>,
): ValidationResult & { project: ProjectInput | null } {
  const issues = new Issues();
  const keys = Object.keys(record);
  const mapping = mapHeaders(keys, PROJECT_COLUMNS);
  checkHeaders(mapping, issues);
  if (issues.hasErrors) return { ...issues.result(), project: null };

  const raw = (field: ProjectField) => record[keys[mapping.columns[field]!]!];
  const reader = new RowReader(
    { cells: keys.map((key) => record[key]) },
    mapping,
    PROJECT_LABELS,
    PROJECT_RULES,
    issues,
  );
  const loc = (field: ProjectField) => ({
    column: mapping.headers[field] ?? PROJECT_LABELS[field],
  });
  const dateOf = (field: ProjectField) => {
    const result = parseDate(raw(field));
    if (!result.ok)
      issues.error(PROJECT_RULES[field], valueProblem(raw(field), result.reason), loc(field));
    return result.ok ? result.value : undefined;
  };

  const candidate = {
    name: reader.text('name'),
    currency: sanitizeText(raw('currency')).value.toUpperCase(),
    startDate: dateOf('startDate'),
    endDate: dateOf('endDate'),
    statusDate: dateOf('statusDate'),
  };
  if (issues.hasErrors) return { ...issues.result(), project: null };

  const parsed = ProjectInputSchema.safeParse(candidate);
  if (!parsed.success) addZodIssues(parsed.error, PROJECT_RULES, issues, loc, raw);
  return { ...issues.result(), project: parsed.success ? parsed.data : null };
}

/**
 * Reads a Project sheet in either layout:
 * - a header row (Name, Currency, Start Date, …) with the values in the next row, or
 * - label/value pairs, one per row (Name | Clinic …).
 */
export function parseProjectSheet(
  sheet: SheetData,
): ValidationResult & { project: ProjectInput | null } {
  const headers = sheet.headers.map((header) => sanitizeText(header).value);
  const matched = PROJECT_COLUMNS.length - mapHeaders(headers, PROJECT_COLUMNS).missing.length;
  if (matched >= 2) {
    const values = sheet.rows.find((cells) => !cells.every(isBlank)) ?? [];
    return parseProjectRecord(Object.fromEntries(headers.map((header, i) => [header, values[i]])));
  }
  const pairs = [sheet.headers, ...sheet.rows]
    .filter((cells) => !isBlank(cells[0]))
    .map((cells) => [sanitizeText(cells[0]).value, cells[1]] as const);
  return parseProjectRecord(Object.fromEntries(pairs));
}

const FULL_PROJECT_RULES: Record<string, string> = {
  ...PROJECT_RULES,
  id: 'FR-08',
  bac: 'FR-08',
  createdAt: 'FR-08',
  updatedAt: 'FR-08',
};

/** Validates a complete stored project (id and timestamps included), e.g. from a .evm.json file. */
export function validateFullProject(
  input: unknown,
): ValidationResult & { project: Project | null } {
  const issues = new Issues();
  const record = (typeof input === 'object' && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  const parsed = ProjectSchema.safeParse(input);
  if (!parsed.success) {
    addZodIssues(
      parsed.error,
      FULL_PROJECT_RULES,
      issues,
      (field) => ({ column: PROJECT_LABELS[field as ProjectField] ?? field }),
      (field) => record[field],
    );
  }
  return { ...issues.result(), project: parsed.success ? parsed.data : null };
}
