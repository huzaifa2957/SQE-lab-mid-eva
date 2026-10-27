// Tolerant parsers for user-supplied spreadsheet cells (PROJECT_PLAN VR-06…VR-08, VR-16, FR-06).
//
// Parsers never throw: they return { ok: true, value } or { ok: false, reason }.
// Range checks (≥ 0, ≤ 100, …) are business rules and live in validation.ts.

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const ok = <T>(value: T): ParseResult<T> => ({ ok: true, value });
const fail = <T>(reason: string): ParseResult<T> => ({ ok: false, reason });

/** True for null, undefined and strings that are empty after trimming. */
export function isBlank(input: unknown): boolean {
  return (
    input === null || input === undefined || (typeof input === 'string' && input.trim() === '')
  );
}

// ---------------------------------------------------------------------------
// Numbers — "1,200", "Rs 1200", "$1,200.50", "PKR 1,200", "1200 USD", "(500)"
// ---------------------------------------------------------------------------

// "Rs"/"Rs." or an upper-case ISO code (PKR, USD) or a symbol. Lower-case words are not
// stripped, so "12abc" is rejected rather than read as 12.
const CURRENCY_PREFIX = /^(?:R[sS]\.?|rs\.?|[A-Z]{3}|[$€£¥₹₨])\s*/;
const CURRENCY_SUFFIX = /\s*(?:R[sS]\.?|rs\.?|[A-Z]{3}|[$€£¥₹₨])$/;
// Either plain digits or correctly grouped thousands, optional decimals.
const PLAIN_NUMBER = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$|^\.\d+$/;

/** Parses a money/number cell. Negative values are returned as-is; range rules are applied later. */
export function parseNumber(input: unknown): ParseResult<number> {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? ok(input) : fail('is not a valid number');
  }
  if (typeof input !== 'string') return fail('is not a valid number');

  let text = input.trim();
  if (text === '') return fail('is required');

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true; // accounting style (500)
    text = text.slice(1, -1).trim();
  }
  if (text.startsWith('-')) {
    if (negative) return fail('is not a valid number');
    negative = true;
    text = text.slice(1).trim();
  }
  text = text.replace(CURRENCY_PREFIX, '').replace(CURRENCY_SUFFIX, '').trim();
  if (text.startsWith('-')) {
    if (negative) return fail('is not a valid number'); // only one sign: "--5", "(-5)"
    negative = true; // "$-1200", "Rs -1200"
    text = text.slice(1).trim();
  }

  if (!PLAIN_NUMBER.test(text)) return fail('is not a valid number');
  const value = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(value)) return fail('is not a valid number');
  return ok(negative && value !== 0 ? -value : value);
}

// ---------------------------------------------------------------------------
// Percent — "45%", 45, "45", 0.45
// ---------------------------------------------------------------------------

export interface ParsedPercent {
  /** The number as written, without scaling: "45%" → 45, 0.45 → 0.45. */
  value: number;
  /** True when the cell carried an explicit "%" sign (so it is definitely 0–100 scale). */
  hadPercentSign: boolean;
}

export function parsePercent(input: unknown): ParseResult<ParsedPercent> {
  if (typeof input === 'string') {
    const text = input.trim();
    if (text.endsWith('%')) {
      const number = parseNumber(text.slice(0, -1));
      return number.ok ? ok({ value: number.value, hadPercentSign: true }) : number;
    }
  }
  const number = parseNumber(input);
  return number.ok ? ok({ value: number.value, hadPercentSign: false }) : number;
}

/**
 * VR-07: true when every value without a "%" sign is ≤ 1 (and at least one is > 0),
 * i.e. the column looks like fractions (0.45 = 45%) and the user should confirm.
 * Any value with an explicit "%" means the column is already on the 0–100 scale.
 */
export function looksLikeFractions(values: readonly ParsedPercent[]): boolean {
  if (values.length === 0 || values.some((v) => v.hadPercentSign)) return false;
  return values.every((v) => v.value <= 1) && values.some((v) => v.value > 0);
}

// ---------------------------------------------------------------------------
// Dates — YYYY-MM-DD, DD/MM/YYYY (also DD-MM-YYYY, DD.MM.YYYY), Excel serials, Date objects
// ---------------------------------------------------------------------------

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/;
const DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const SERIAL = /^\d+(?:\.\d+)?$/;
// Excel serial 61 = 1900-03-01; earlier serials are affected by Excel's 1900 leap-year bug.
const EXCEL_SERIAL_MIN = 61;
const EXCEL_SERIAL_MAX = 2_958_465; // 9999-12-31
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

function isoFromParts(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function isoFromExcelSerial(serial: number): string | null {
  if (serial < EXCEL_SERIAL_MIN || serial > EXCEL_SERIAL_MAX) return null;
  return new Date(EXCEL_EPOCH_MS + Math.floor(serial) * MS_PER_DAY).toISOString().slice(0, 10);
}

const DATE_REASON = 'is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)';

/** Parses a date cell to an ISO "YYYY-MM-DD" string. */
export function parseDate(input: unknown): ParseResult<string> {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return fail(DATE_REASON);
    return ok(input.toISOString().slice(0, 10));
  }
  if (typeof input === 'number') {
    const iso = Number.isFinite(input) ? isoFromExcelSerial(input) : null;
    return iso ? ok(iso) : fail(DATE_REASON);
  }
  if (typeof input !== 'string') return fail(DATE_REASON);

  const text = input.trim();
  if (text === '') return fail('is required');

  let iso: string | null = null;
  let match: RegExpExecArray | null;
  if ((match = ISO.exec(text))) {
    iso = isoFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
  } else if ((match = DMY.exec(text))) {
    iso = isoFromParts(Number(match[3]), Number(match[2]), Number(match[1]));
  } else if (SERIAL.test(text)) {
    iso = isoFromExcelSerial(Number(text));
  }
  return iso ? ok(iso) : fail(DATE_REASON);
}

// ---------------------------------------------------------------------------
// Headers — "Actual Cost" = "actual_cost" = "ACTUAL-COST" (FR-06)
// ---------------------------------------------------------------------------

/** Lower-cases and removes spaces, underscores, hyphens and dots. */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[\s_\-.]+/g, '');
}

export interface ColumnSpec<F extends string> {
  field: F;
  label: string; // canonical header shown to users
  required: boolean;
  aliases?: readonly string[];
}

export interface HeaderMapping<F extends string> {
  /** Field → column index in the file. */
  columns: Partial<Record<F, number>>;
  /** Field → header text exactly as written in the file. */
  headers: Partial<Record<F, string>>;
  missing: ColumnSpec<F>[];
  /** Headers that matched a field already taken by an earlier column. */
  duplicates: string[];
  /** Headers that matched nothing (ignored). */
  unknown: string[];
}

export function mapHeaders<F extends string>(
  headers: readonly string[],
  specs: readonly ColumnSpec<F>[],
): HeaderMapping<F> {
  const lookup = new Map<string, ColumnSpec<F>>();
  for (const spec of specs) {
    for (const name of [spec.label, ...(spec.aliases ?? [])])
      lookup.set(normalizeHeader(name), spec);
  }

  const mapping: HeaderMapping<F> = {
    columns: {},
    headers: {},
    missing: [],
    duplicates: [],
    unknown: [],
  };
  headers.forEach((header, index) => {
    if (header.trim() === '') return;
    const spec = lookup.get(normalizeHeader(header));
    if (!spec) mapping.unknown.push(header);
    else if (mapping.columns[spec.field] !== undefined) mapping.duplicates.push(header);
    else {
      mapping.columns[spec.field] = index;
      mapping.headers[spec.field] = header.replace(/^\uFEFF/, '').trim();
    }
  });
  mapping.missing = specs.filter(
    (spec) => spec.required && mapping.columns[spec.field] === undefined,
  );
  return mapping;
}

// ---------------------------------------------------------------------------
// Text sanitising (VR-16)
// ---------------------------------------------------------------------------

// C0/C1 control characters and Unicode bidi overrides (used to disguise text).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;
const HAS_CONTROL_CHARS = new RegExp(CONTROL_CHARS.source);

/** Cells starting with these are treated as formulas by spreadsheet apps (SR-04). */
export const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export interface SanitizedText {
  value: string;
  /** Control characters were removed. */
  changed: boolean;
  truncated: boolean;
}

/**
 * Converts a cell to plain text: tabs and line breaks become spaces, other control
 * characters are removed, whitespace is collapsed and trimmed, and the result is cut
 * to maxLength. The text is never interpreted as HTML or a formula — it is kept as
 * literal characters.
 */
export function sanitizeText(input: unknown, maxLength = Infinity): SanitizedText {
  const raw = input === null || input === undefined ? '' : String(input);
  const cleaned = raw.replace(/[\t\n\v\f\r]/g, ' ').replace(CONTROL_CHARS, '');
  const collapsed = cleaned.replace(/\s+/g, ' ').trim();
  const truncated = collapsed.length > maxLength;
  return {
    value: truncated ? collapsed.slice(0, maxLength) : collapsed,
    changed: HAS_CONTROL_CHARS.test(raw),
    truncated,
  };
}

/** VR-16 / SR-04: the raw cell would be run as a formula if pasted into a spreadsheet. */
export function looksLikeFormula(input: unknown): boolean {
  return (
    typeof input === 'string' &&
    (FORMULA_PREFIX.test(input) || FORMULA_PREFIX.test(input.trimStart()))
  );
}
