// WCAG AA contrast for every text/background token pair, in both themes (design system §4, NF-03).

import { describe, expect, it } from 'vitest';
import css from '../index.css?raw';

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No block for ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]),
  );
}

const light = block(':root');
const dark = block(":root[data-theme='dark']");
const darkSystem = block(":root:not([data-theme='light'])");

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** [text token, background token] pairs used by components. */
const TEXT_PAIRS: [string, string][] = [
  ['text', 'bg'],
  ['text', 'card'],
  ['text', 'card-subtle'],
  ['text-muted', 'bg'],
  ['text-muted', 'card'],
  ['text-muted', 'card-subtle'],
  ['accent-text', 'accent'],
  ['accent-text', 'accent-hover'],
  ['feature-text', 'feature'],
  ['feature-muted', 'feature'],
  ['success-strong', 'success-soft'],
  ['warning-strong', 'warning-soft'],
  ['error-strong', 'error-soft'],
  ['success-strong', 'card'],
  ['warning-strong', 'card'],
  ['error-strong', 'card'],
  ['text', 'error-soft'],
  ['text', 'warning-soft'],
];

/** Non-text UI (icons, borders of inputs, focus ring) needs 3:1 (WCAG 1.4.11). */
const UI_PAIRS: [string, string][] = [
  ['border-strong', 'card'],
  ['success', 'card'],
  ['error', 'card'],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('colour tokens — %s mode', (_mode, tokens) => {
  it.each(TEXT_PAIRS)('CT-CON %s on %s ≥ 4.5:1', (fg, bg) => {
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)('CT-CON %s on %s ≥ 3:1 (non-text)', (fg, bg) => {
    expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(3);
  });
});

describe('token sets', () => {
  it('CT-CON-00 the system dark set matches the explicit dark set, and brand colours are as specified', () => {
    expect(darkSystem).toEqual(dark);
    expect(light).toMatchObject({
      accent: '#d4f468',
      'accent-text': '#263719',
      feature: '#183a2b',
      bg: '#f4f5ef',
      card: '#ffffff',
      text: '#17241c',
      'text-muted': '#5b685f',
      border: '#d8ded3',
      success: '#3f8f5b',
      warning: '#d9a23a',
      error: '#b85450',
    });
    expect(dark).toMatchObject({
      bg: '#101612',
      card: '#18221b',
      text: '#f0f4e9',
      accent: '#d4f468',
    });
  });

  it('CT-CON-01 the focus ring is visible: lime outer ring and the text-coloured inner ring', () => {
    for (const tokens of [light, dark]) {
      const ring = Math.max(
        contrast(tokens.accent!, tokens.card!),
        contrast(tokens.text!, tokens.card!),
      );
      expect(ring).toBeGreaterThanOrEqual(3);
    }
  });
});
