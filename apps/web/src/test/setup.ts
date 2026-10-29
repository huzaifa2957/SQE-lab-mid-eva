import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// jsdom has no canvas: charts render as an accessible <canvas> stub that records its props.
// The chart data itself is tested through the pure builders in lib/chartData.ts.
vi.mock('react-chartjs-2', async () => {
  const React = await import('react');
  interface StubProps {
    role?: string;
    'aria-label'?: string;
    data?: { datasets?: { label?: string }[] };
  }
  const make = (type: string) =>
    React.forwardRef<{ toBase64Image: () => string }, StubProps>(function ChartStub(props, ref) {
      React.useImperativeHandle(ref, () => ({
        toBase64Image: () => `data:image/png;base64,${type}`,
      }));
      return React.createElement('canvas', {
        role: props.role ?? 'img',
        'aria-label': props['aria-label'],
        'data-chart': type,
        'data-series': (props.data?.datasets ?? []).map((d) => d.label).join('|'),
      });
    });
  return { Line: make('line'), Bar: make('bar') };
});

// jsdom lacks matchMedia; tests can override `systemPrefersDark` per case.
export const media = { systemPrefersDark: false };

const hasDom = typeof window !== 'undefined';

beforeEach(() => {
  if (!hasDom) return; // node-environment tests (e.g. excel.test.ts)
  media.systemPrefersDark = false;
  window.localStorage.clear();
  window.location.hash = '';
  delete document.documentElement.dataset.theme;

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('dark') ? media.systemPrefersDark : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });

  // Downloads: record instead of navigating (jsdom cannot download).
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  if (hasDom) cleanup();
  vi.restoreAllMocks();
});
