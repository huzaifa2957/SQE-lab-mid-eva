import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileBuffer } from '../lib/files';
import * as pdf from '../lib/report/pdfReport';
import { buildSampleDocument } from '../lib/sampleProject';
import { makeDocument, renderApp } from './render';

const mocks = vi.hoisted(() => ({
  pdf: null as null | ((...args: unknown[]) => Promise<ArrayBuffer>),
  excel: null as null | ((...args: unknown[]) => Promise<ArrayBuffer>),
}));

vi.mock('../lib/report/pdfReport', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/report/pdfReport')>();
  return {
    ...real,
    buildPdfReport: vi.fn((...args: Parameters<typeof real.buildPdfReport>) =>
      mocks.pdf ? mocks.pdf(...args) : real.buildPdfReport(...args),
    ),
  };
});
// ExcelJS output is tested in Node (reports.test.ts); jsdom and JSZip disagree on binary types.
vi.mock('../lib/report/excelReport', () => ({
  buildExcelReport: vi.fn((...args: unknown[]) =>
    mocks.excel ? mocks.excel(...args) : Promise.resolve(new ArrayBuffer(8)),
  ),
}));

const sample = () => buildSampleDocument('sample', '2026-04-03T00:00:00.000Z');

/** File names and blobs of downloads started through <a download>. */
function recordDownloads() {
  const files: { name: string; blob: Blob }[] = [];
  let lastBlob: Blob | null = null;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    lastBlob = blob;
    return 'blob:test';
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    files.push({ name: this.download, blob: lastBlob! });
  });
  return files;
}

beforeEach(() => {
  mocks.pdf = null;
  mocks.excel = null;
});

describe('Report page (FR-40…FR-43)', () => {
  it('CT-RPT-01 title, actions (PDF primary), all sections on, preview with key numbers', async () => {
    await renderApp({ documents: [sample()], page: 'report' });
    expect(screen.getByRole('heading', { name: 'Report', level: 1 })).toBeInTheDocument();
    const pdfButton = screen.getByRole('button', { name: 'Download PDF' });
    expect(pdfButton).toHaveClass('bg-accent');
    expect(screen.getByRole('button', { name: 'Excel' })).not.toHaveClass('bg-accent');
    expect(screen.getByRole('button', { name: 'CSV' })).not.toHaveClass('bg-accent');

    const boxes = within(screen.getByRole('group', { name: 'Report sections' })).getAllByRole(
      'checkbox',
    );
    expect(boxes).toHaveLength(8);
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);

    const contents = within(screen.getByRole('list', { name: 'Report contents' }));
    expect(contents.getAllByRole('heading').map((h) => h.textContent)).toEqual([
      'KPI summary',
      'Charts',
      'Task table',
      'Insights',
      'Unusual expenses',
      'AI summary',
      'Snapshot history',
      'Formula appendix',
    ]);
    expect(contents.getByText(/CPI 0\.87 · SPI 0\.95/)).toBeInTheDocument();
    expect(contents.getByText(/2 found: 1 high, 1 medium, 0 low/)).toBeInTheDocument();
    expect(screen.getByText('At risk')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Report warnings' })).not.toBeInTheDocument();
  });

  it('CT-RPT-02 unticking a section removes it from the preview and the PDF', async () => {
    const files = recordDownloads();
    const { user } = await renderApp({ documents: [sample()], page: 'report' });
    await user.click(screen.getByRole('checkbox', { name: /Formula appendix/ }));
    expect(
      within(screen.getByRole('list', { name: 'Report contents' })).queryByText('Formula appendix'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(files).toHaveLength(1));
    const [, sections] = vi.mocked(pdf.buildPdfReport).mock.calls.at(-1)!;
    expect([...sections].sort()).not.toContain('formulas');
    expect(sections.size).toBe(7);
  });

  it('CT-RPT-03 PDF: generated, named EVM_<project>_<statusDate>.pdf, success toast', async () => {
    const files = recordDownloads();
    const { user } = await renderApp({ documents: [sample()], page: 'report' });
    await user.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(files).toHaveLength(1));
    expect(files[0]!.name).toMatch(/^EVM_[A-Za-z0-9_-]+_2026-\d\d-\d\d\.pdf$/);
    expect(files[0]!.blob.type).toBe('application/pdf');
    const head = new TextDecoder().decode((await readFileBuffer(files[0]!.blob)).slice(0, 5));
    expect(head).toBe('%PDF-');
    expect(await screen.findByText('PDF report downloaded')).toBeInTheDocument();
  });

  it('CT-RPT-04 CSV and Excel downloads use the right names and types', async () => {
    const files = recordDownloads();
    const doc = sample();
    const { user } = await renderApp({ documents: [doc], page: 'report' });
    await user.click(screen.getByRole('button', { name: 'CSV' }));
    await user.click(screen.getByRole('button', { name: 'Excel' }));
    await waitFor(() => expect(files).toHaveLength(2));
    const stem = `EVM_${doc.project.name
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s-]+/g, '_')}_${doc.project.statusDate}`;
    expect(files.map((f) => f.name)).toEqual([`${stem}.csv`, `${stem}.xlsx`]);
    expect(files[0]!.blob.type).toBe('text/csv;charset=utf-8');
    const bytes = new Uint8Array(await readFileBuffer(files[0]!.blob));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    expect(files[1]!.blob.type).toMatch(/spreadsheetml/);
  });

  it('CT-RPT-05 shows progress while generating and a clear message on failure (no crash)', async () => {
    const files = recordDownloads();
    let fail: (error: Error) => void = () => {};
    mocks.pdf = () => new Promise((_resolve, reject) => (fail = reject));
    const { user } = await renderApp({ documents: [sample()], page: 'report' });
    await user.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(await screen.findByText('Generating PDF…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excel' })).toBeDisabled();

    await act(async () => fail(new Error('internal jsPDF details')));
    expect(await screen.findByText('Could not create the PDF report')).toBeInTheDocument();
    expect(screen.getByText(/Nothing was downloaded/)).toBeInTheDocument();
    expect(screen.queryByText(/internal jsPDF details/)).not.toBeInTheDocument();
    expect(screen.queryByText('Generating PDF…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
    expect(files).toHaveLength(0);

    mocks.excel = () => Promise.reject(new Error('zip failed'));
    await user.click(screen.getByRole('button', { name: 'Excel' }));
    expect(await screen.findByText('Could not create the Excel report')).toBeInTheDocument();
  });

  it('CT-RPT-06 warns before export (no tasks / out-of-date summary) but allows it', async () => {
    const files = recordDownloads();
    const doc = makeDocument({
      tasks: [],
      aiSummary: {
        executiveSummary: 'Old',
        keyRisks: ['a', 'b'],
        recommendations: ['1', '2', '3'],
        source: 'offline',
        generatedAt: '2026-02-01T00:00:00.000Z',
        fingerprint: '00000000',
      },
    });
    const { user } = await renderApp({ documents: [doc], page: 'report' });
    const warnings = within(screen.getByRole('region', { name: 'Report warnings' }));
    expect(warnings.getByText(/no tasks/)).toBeInTheDocument();
    expect(warnings.getByText(/AI summary is out of date/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Download PDF' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Export with warnings?' }));
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    expect(files).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'CSV' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Export CSV anyway' }),
    );
    await waitFor(() => expect(files).toHaveLength(1));
    expect(files[0]!.name).toBe('EVM_Office_Fit_out_2026-02-01.csv');
  });

  it('CT-RPT-07 the four charts are rendered off-screen in the light theme for the PDF', async () => {
    document.documentElement.dataset.theme = 'dark';
    window.localStorage.setItem('evm.theme', 'dark');
    const { user } = await renderApp({ documents: [sample()], page: 'report' });
    const print = screen.getByTestId('print-charts');
    expect(print).toHaveAttribute('aria-hidden', 'true');
    expect(print).toHaveAttribute('inert');
    expect(print.querySelectorAll('canvas[data-chart]')).toHaveLength(4);

    recordDownloads();
    await user.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(vi.mocked(pdf.buildPdfReport)).toHaveBeenCalled());
    const images = vi.mocked(pdf.buildPdfReport).mock.calls.at(-1)![2];
    expect(Object.keys(images).sort()).toEqual([
      'cost-by-task',
      'cpi-spi-trend',
      's-curve',
      'variance-by-category',
    ]);
  });

  it('CT-RPT-08 no project: empty state', async () => {
    await renderApp({ documents: [], page: 'report' });
    expect(await screen.findByText('Create a project to see the report')).toBeInTheDocument();
  });
});
