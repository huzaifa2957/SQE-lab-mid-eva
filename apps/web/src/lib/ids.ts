import type { ProjectInput } from '@evm/core';

/** A random id; falls back to getRandomValues where randomUUID is unavailable (non-secure contexts). */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Today's date as YYYY-MM-DD in the user's local time zone. */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Blank new-project form: starts today, runs 90 days. */
export function defaultProjectInput(): ProjectInput {
  const today = todayIso();
  return {
    name: '',
    currency: 'PKR',
    startDate: today,
    endDate: addDays(today, 90),
    statusDate: today,
  };
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
