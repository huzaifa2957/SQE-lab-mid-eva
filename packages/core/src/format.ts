// Display formatting. This is the only place values are rounded (2 dp for
// currency, percentages and indices). null, NaN and ±Infinity display as "N/A".

export const NOT_AVAILABLE = 'N/A';
export const DEFAULT_LOCALE = 'en-US';
const DISPLAY_DECIMALS = 2;

/** Returns a displayable number, or null. Values that would round to zero become 0 (no "-0.00"). */
function displayable(value: number | null | undefined, decimals: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value;
}

/** Plain number with fixed decimals and grouping, e.g. 1234.5 → "1,234.50". */
export function formatNumber(
  value: number | null | undefined,
  decimals = DISPLAY_DECIMALS,
  locale = DEFAULT_LOCALE,
): string {
  const v = displayable(value, decimals);
  if (v === null) return NOT_AVAILABLE;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

/** Currency to 2 dp, e.g. (−2000, "USD") → "-$2,000.00". Unknown codes fall back to "XYZ 1,234.50". */
export function formatCurrency(
  value: number | null | undefined,
  currency: string,
  locale = DEFAULT_LOCALE,
): string {
  const v = displayable(value, DISPLAY_DECIMALS);
  if (v === null) return NOT_AVAILABLE;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: DISPLAY_DECIMALS,
      maximumFractionDigits: DISPLAY_DECIMALS,
    }).format(v);
  } catch {
    return `${currency} ${formatNumber(v, DISPLAY_DECIMALS, locale)}`;
  }
}

/** A value already expressed in percent, e.g. −25 → "-25.00%". */
export function formatPercent(value: number | null | undefined, locale = DEFAULT_LOCALE): string {
  const text = formatNumber(value, DISPLAY_DECIMALS, locale);
  return text === NOT_AVAILABLE ? text : `${text}%`;
}

/** Performance index (CPI, SPI, TCPI) to 2 dp, e.g. 0.8 → "0.80". */
export function formatIndex(value: number | null | undefined, locale = DEFAULT_LOCALE): string {
  return formatNumber(value, DISPLAY_DECIMALS, locale);
}

/** FR-13: why a metric shows "N/A" (used as a tooltip). */
export const NA_REASONS = {
  variancePercent: 'Budget is 0, so a percentage variance cannot be calculated.',
  cpi: 'Actual cost is 0, so CPI (EV ÷ AC) cannot be calculated yet.',
  spi: 'Planned value is 0 (no work was scheduled by the status date), so SPI (EV ÷ PV) cannot be calculated.',
  cvPercent: 'Earned value is 0, so CV% cannot be calculated.',
  svPercent: 'Planned value is 0, so SV% cannot be calculated.',
  eac: 'CPI is not available or is 0, so this EAC method cannot be calculated.',
  tcpi: 'Actual cost equals the budget, so there is no budget left to compare against.',
  bacPercent: 'Total budget (BAC) is 0, so this percentage cannot be calculated.',
} as const;

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * Makes a safe file-name stem (FR-43): letters, digits, "_" and "-" only; spaces become "_";
 * accents are dropped; at most 80 characters. Falls back when nothing is left.
 */
export function sanitizeFileName(name: string, fallback = 'file'): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)
    .replace(/^_+|_+$/g, '');
  if (cleaned === '') return fallback;
  return WINDOWS_RESERVED.test(cleaned) ? `${cleaned}_file` : cleaned;
}
