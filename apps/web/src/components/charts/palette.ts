// Chart colours read from the design tokens (docs/design-system.md §9), so charts switch
// with light/dark mode. Fallbacks (light palette) are used when CSS variables are unavailable.

import { useMemo } from 'react';
import { useTheme } from '../../state/ThemeProvider';

export interface ChartPalette {
  text: string;
  muted: string;
  grid: string;
  reference: string;
  success: string;
  successSoft: string;
  error: string;
  warning: string;
  /** EAC projection / CPI line: forest green in light mode, lime in dark mode (lime is too light on white). */
  highlight: string;
  card: string;
}

const FALLBACK: ChartPalette = {
  text: '#17241c',
  muted: '#5b685f',
  grid: '#d8ded3',
  reference: '#879483',
  success: '#3f8f5b',
  successSoft: '#e3f1e7',
  error: '#b85450',
  warning: '#d9a23a',
  highlight: '#183a2b',
  card: '#ffffff',
};

export function readPalette(theme: 'light' | 'dark'): ChartPalette {
  let style: CSSStyleDeclaration | null = null;
  try {
    style = getComputedStyle(document.documentElement);
  } catch {
    style = null;
  }
  const read = (name: string, fallback: string) => style?.getPropertyValue(name).trim() || fallback;
  return {
    text: read('--text', FALLBACK.text),
    muted: read('--text-muted', FALLBACK.muted),
    grid: read('--border', FALLBACK.grid),
    reference: read('--border-strong', FALLBACK.reference),
    success: read('--success', FALLBACK.success),
    successSoft: read('--success-soft', FALLBACK.successSoft),
    error: read('--error', FALLBACK.error),
    warning: read('--warning', FALLBACK.warning),
    highlight:
      theme === 'dark' ? read('--accent', '#d4f468') : read('--feature', FALLBACK.highlight),
    card: read('--card', FALLBACK.card),
  };
}

/** Re-reads the palette whenever the theme changes. */
export function useChartPalette(): ChartPalette {
  const { theme } = useTheme();
  return useMemo(() => readPalette(theme), [theme]);
}

/** Adds transparency to a #rrggbb colour. */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}
