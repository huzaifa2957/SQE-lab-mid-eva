// File import pipeline (FR-03, FR-05). All checks come from @evm/core:
// 1. readImportFile: VR-01/VR-02 file checks, then parse CSV (PapaParse, in core) or Excel (ExcelJS).
// 2. validateImport: run the core validators on the parsed sheets (re-run when options change).

import {
  type PeriodImportResult,
  type Project,
  type ProjectInput,
  parseCsv,
  parseProjectSheet,
  type SheetData,
  type TaskImportResult,
  type ValidationIssue,
  type ValidationResult,
  validateFileMeta,
  validatePeriodRows,
  validateTaskRows,
} from '@evm/core';
import { readWorkbook } from './excel';
import { readFileBuffer, readFileText } from './files';

export type ImportKind = 'csv' | 'xlsx';

export interface ParsedImport {
  fileName: string;
  kind: ImportKind;
  /** Structural problems found while reading (e.g. a broken CSV quote). */
  readIssues: ValidationIssue[];
  tasks: SheetData | null;
  periods: SheetData | null;
  project: SheetData | null;
}

export type ReadResult =
  { ok: true; parsed: ParsedImport } | { ok: false; errors: ValidationIssue[] };

const readFailure = (message: string): ReadResult => ({
  ok: false,
  errors: [{ ruleId: 'VR-01', severity: 'error', message, detail: message }],
});

/** Checks the file (VR-01, VR-02) and parses it into sheets. Never throws. */
export async function readImportFile(file: File): Promise<ReadResult> {
  const check = validateFileMeta({ name: file.name, size: file.size, type: file.type });
  if (!check.valid) return { ok: false, errors: check.errors };

  const kind: ImportKind = file.name.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv';
  try {
    if (kind === 'csv') {
      const { sheet, errors } = parseCsv(await readFileText(file));
      return {
        ok: true,
        parsed: {
          fileName: file.name,
          kind,
          readIssues: errors,
          tasks: sheet,
          periods: null,
          project: null,
        },
      };
    }
    const workbook = await readWorkbook(await readFileBuffer(file));
    if (!workbook.tasks) return readFailure(`"${file.name}" has no Tasks sheet.`);
    return {
      ok: true,
      parsed: {
        fileName: file.name,
        kind,
        readIssues: [],
        tasks: workbook.tasks,
        periods: workbook.periods,
        project: workbook.project,
      },
    };
  } catch {
    // Library errors (e.g. JSZip internals) are not shown to users (RL-02).
    return readFailure(
      kind === 'xlsx'
        ? `"${file.name}" could not be read as an Excel workbook. The file may be damaged or not really an .xlsx file.`
        : `"${file.name}" could not be read as a CSV file. Check that it is saved as text (UTF-8).`,
    );
  }
}

export interface ImportOptions {
  /** Current project, used for VR-10 when the file has no Project sheet. */
  currentProject?: Pick<Project, 'startDate' | 'endDate'> | null;
  /** VR-07 answer: undefined until the user confirms. */
  percentAsFraction?: boolean;
}

export interface ImportValidation {
  tasks: TaskImportResult;
  periods: PeriodImportResult | null;
  project: (ValidationResult & { project: ProjectInput | null }) | null;
  errorCount: number;
  warningCount: number;
  /** VR-07: the user must say whether % Complete values are fractions. */
  needsFractionAnswer: boolean;
  canImport: boolean;
}

export function validateImport(
  parsed: ParsedImport,
  options: ImportOptions = {},
): ImportValidation {
  const project = parsed.project ? parseProjectSheet(parsed.project) : null;
  const projectDates = project?.project ?? options.currentProject ?? undefined;
  const tasks = validateTaskRows(parsed.tasks ?? { headers: [], rows: [] }, {
    project: projectDates,
    percentAsFraction: options.percentAsFraction,
  });
  const periods = parsed.periods ? validatePeriodRows(parsed.periods) : null;

  const results = [tasks, periods, project].filter((r): r is NonNullable<typeof r> => r !== null);
  const errorCount = parsed.readIssues.length + results.reduce((n, r) => n + r.errors.length, 0);
  const warningCount = results.reduce((n, r) => n + r.warnings.length, 0);
  const needsFractionAnswer =
    tasks.percentFractionSuspected && options.percentAsFraction === undefined;

  return {
    tasks,
    periods,
    project,
    errorCount,
    warningCount,
    needsFractionAnswer,
    canImport: errorCount === 0 && !needsFractionAnswer && tasks.tasks.length > 0,
  };
}
