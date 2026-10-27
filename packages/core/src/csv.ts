// CSV reading (PapaParse) → SheetData → validation. Pure: takes text, never touches files.

import Papa from 'papaparse';
import {
  type PeriodImportResult,
  type SheetData,
  type TaskImportOptions,
  type TaskImportResult,
  type ValidationIssue,
  validatePeriodRows,
  validateTaskRows,
} from './validation';

export interface CsvParseResult {
  sheet: SheetData;
  /** Structural problems such as an unclosed quote (VR-01). */
  errors: ValidationIssue[];
}

/**
 * Splits CSV text into a header row and data rows. Blank lines are kept so that
 * row numbers in messages match the line numbers users see in Excel.
 */
export function parseCsv(text: string): CsvParseResult {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: false });
  const errors: ValidationIssue[] = result.errors
    .filter((error) => error.code !== 'UndetectableDelimiter') // single-column files are fine
    .map((error) => ({
      ruleId: 'VR-01',
      severity: 'error' as const,
      row: error.row === undefined ? undefined : error.row + 1,
      message: `${error.row === undefined ? 'The file' : `Row ${error.row + 1}`} could not be read as CSV: ${error.message}.`,
    }));
  const [headers = [], ...rows] = result.data;
  return { sheet: { headers, rows }, errors };
}

function withCsvErrors<T extends { valid: boolean; errors: ValidationIssue[] }>(
  csvErrors: ValidationIssue[],
  result: T,
): T {
  if (csvErrors.length === 0) return result;
  return { ...result, valid: false, errors: [...csvErrors, ...result.errors] };
}

/** Reads and validates a Tasks CSV. */
export function importTasksCsv(text: string, options: TaskImportOptions = {}): TaskImportResult {
  const { sheet, errors } = parseCsv(text);
  return withCsvErrors(errors, validateTaskRows(sheet, options));
}

/** Reads and validates a Periods CSV (Date, PV, EV, AC). */
export function importPeriodsCsv(text: string): PeriodImportResult {
  const { sheet, errors } = parseCsv(text);
  return withCsvErrors(errors, validatePeriodRows(sheet));
}
