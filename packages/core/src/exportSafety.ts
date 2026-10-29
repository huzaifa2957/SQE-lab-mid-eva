// Safe exports: spreadsheet formula-injection escaping (SR-04), CSV serialisation (FR-42)
// and report file names (FR-43).

import { sanitizeFileName } from './format';
import { FORMULA_PREFIX } from './parsers';

export type ExportCell = string | number | boolean | null | undefined;

/**
 * SR-04: a text cell starting with = + - @ tab or carriage return is prefixed with a single
 * quote so spreadsheet apps show it as text instead of running it as a formula. Numbers,
 * booleans and empty cells are returned unchanged (numbers stay numbers).
 */
export function escapeSpreadsheetCell<T extends ExportCell>(value: T): T | string {
  return typeof value === 'string' && FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

/** Byte order mark so Excel opens UTF-8 CSV files with the right characters. */
export const UTF8_BOM = '﻿';

function csvField(value: ExportCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = String(escapeSpreadsheetCell(String(value)));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * RFC 4180 CSV with CRLF line endings. Text cells are formula-escaped (SR-04) and quoted
 * when needed; numbers are written as plain numbers. Adds a UTF-8 BOM by default.
 */
export function toCsv(
  rows: readonly (readonly ExportCell[])[],
  options: { bom?: boolean } = {},
): string {
  const body = rows.map((row) => row.map(csvField).join(',')).join('\r\n');
  return `${options.bom === false ? '' : UTF8_BOM}${body}\r\n`;
}

/** Longest file-name stem, before the extension (FR-43). */
export const MAX_FILE_STEM = 80;

/**
 * FR-43: "EVM_<project>_<statusDate>.<ext>", sanitised for every OS (no characters that are
 * invalid on Windows, spaces → "_"), with the stem kept to 80 characters by shortening the
 * project name.
 */
export function reportFileName(projectName: string, statusDate: string, extension: string): string {
  // Keep the ISO date readable (2026-04-03); only digits, letters and "-" survive.
  const date = statusDate.replace(/[^0-9a-z-]/gi, '').slice(0, 20) || 'undated';
  const ext =
    extension
      .replace(/^\.+/, '')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase() || 'txt';
  const room = MAX_FILE_STEM - 'EVM__'.length - date.length;
  const name = sanitizeFileName(projectName, 'project')
    .slice(0, Math.max(1, room))
    .replace(/_+$/, '');
  return `EVM_${name || 'project'}_${date}.${ext}`;
}
