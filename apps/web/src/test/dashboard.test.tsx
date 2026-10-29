import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Providers } from '../App';
import { buildSampleDocument } from '../lib/sampleProject';
import { MemoryProjectStorage } from '../lib/storage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { type ChartImages, useChartImages } from '../state/chartImages';
import { makeDocument, renderApp } from './render';

const sample = () => buildSampleDocument('sample', '2026-04-03T00:00:00.000Z');
const kpi = (name: string) => within(screen.getByRole('group', { name }));

describe('Dashboard (FR-25, FR-27)', () => {
  it('CT-DASH-01 KPI cards show the sample project values and §5 statuses', async () => {
    await renderApp({ documents: [sample()], page: 'dashboard' });

    // CPI = 496,000 / 570,000 = 0.87 → red; SPI = 496,000 / 522,926.41 = 0.95 → amber
    expect(kpi('CPI').getByTestId('metric-value')).toHaveTextContent('0.87');
    expect(kpi('CPI').getByText('Action needed')).toBeInTheDocument();
    expect(kpi('SPI').getByTestId('metric-value')).toHaveTextContent('0.95');
    expect(kpi('SPI').getByText('Watch')).toBeInTheDocument();
    expect(kpi('Cost variance (CV)').getByTestId('metric-value')).toHaveTextContent(
      /-PKR\s74,000\.00/,
    );
    expect(kpi('Schedule variance (SV)').getByTestId('metric-value')).toHaveTextContent(
      /-PKR\s26,926\.41/,
    );
    // EAC (typical) = 1,040,000 / 0.870175… = 1,195,161.29; VAC = −155,161.29 (−14.9%) → red
    expect(kpi('EAC').getByTestId('metric-value')).toHaveTextContent(/PKR\s1,195,161\.29/);
    expect(kpi('VAC').getByText('Action needed')).toBeInTheDocument();
    // TCPI = 544,000 / 470,000 = 1.16 → red
    expect(kpi('TCPI').getByTestId('metric-value')).toHaveTextContent('1.16');
    expect(kpi('TCPI').getByText('Action needed')).toBeInTheDocument();
    expect(kpi('% complete').getByTestId('metric-value')).toHaveTextContent('47.69%');
    expect(kpi('% complete').getByText('54.81% spent')).toBeInTheDocument();
  });

  it('CT-DASH-02 trend arrows compare with the previous snapshot (2026-03-20)', async () => {
    await renderApp({ documents: [sample()], page: 'dashboard' });
    // previous CPI = 399,754 / 439,290 = 0.91 → now 0.87: down, worse
    expect(kpi('CPI').getByText('Down from 0.91 on 2026-03-20 (worse)')).toBeInTheDocument();
    // EAC went up → worse (higher is not better)
    expect(kpi('EAC').getByText(/^Up from .* \(worse\)$/)).toBeInTheDocument();
  });

  it('CT-DASH-03 health panel: overall badge, progress bars and headline', async () => {
    await renderApp({ documents: [sample()], page: 'dashboard' });
    const panel = within(screen.getByRole('region', { name: 'Project health' }));
    expect(panel.getByText('At risk')).toBeInTheDocument();
    expect(panel.getByRole('progressbar', { name: 'Work complete' })).toHaveAttribute(
      'aria-valuetext',
      '47.69%',
    );
    expect(panel.getByRole('progressbar', { name: 'Budget spent' })).toHaveAttribute(
      'aria-valuetext',
      '54.81%',
    );
    expect(panel.getByTestId('headline')).toHaveTextContent(
      'Significant cost overrun: each 1 unit spent earns only 0.87',
    );
  });

  it('CT-DASH-04 switching the EAC method recalculates EAC and is saved per project (FR-14)', async () => {
    const { user, storage } = await renderApp({ documents: [sample()], page: 'dashboard' });
    await user.click(kpi('EAC').getByRole('radio', { name: 'Atypical' }));
    // AC + (BAC − EV) = 570,000 + 544,000
    expect(kpi('EAC').getByTestId('metric-value')).toHaveTextContent(/PKR\s1,114,000\.00/);
    expect(kpi('EAC').getByRole('radio', { name: 'Atypical' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await waitFor(async () => {
      const [stored] = (await storage.loadAll()) as { eacMethod: string }[];
      expect(stored!.eacMethod).toBe('atypical');
    });
    // keyboard: arrow right moves to Combined
    await user.keyboard('{ArrowRight}');
    expect(kpi('EAC').getByRole('radio', { name: 'Combined' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('CT-DASH-05 N/A values have a keyboard-reachable reason (FR-13)', async () => {
    const doc = makeDocument({
      tasks: makeDocument().tasks.map((t) => ({ ...t, actualCost: 0, percentComplete: 0 })),
    });
    const { user } = await renderApp({ documents: [doc], page: 'dashboard' });
    expect(kpi('CPI').getByTestId('metric-value')).toHaveTextContent('N/A');
    expect(kpi('CPI').getByText('N/A', { selector: 'span' })).toBeInTheDocument(); // neutral status badge
    const why = kpi('CPI').getByRole('button', { name: 'Why is CPI not available?' });
    await user.tab();
    why.focus();
    expect(why).toHaveAccessibleDescription(
      /Actual cost is 0, so CPI \(EV ÷ AC\) cannot be calculated yet/,
    );
  });

  it('CT-DASH-06 no project: friendly empty state with both actions', async () => {
    const { user } = await renderApp({ documents: [], page: 'dashboard' });
    expect(await screen.findByText('Create a project to see the dashboard')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load sample project' }));
    expect(await screen.findByRole('group', { name: 'CPI' })).toBeInTheDocument();
  });

  it('CT-DASH-07 "Create project" opens the new-project form on Projects', async () => {
    const { user } = await renderApp({ documents: [], page: 'dashboard' });
    await user.click(await screen.findByRole('button', { name: 'Create project' }));
    expect(await screen.findByRole('dialog', { name: 'New project' })).toBeInTheDocument();
  });

  it('CT-DASH-08 without snapshots the trend chart explains what to do; the S-curve still renders', async () => {
    await renderApp({ documents: [makeDocument()], page: 'dashboard' });
    const trend = within(screen.getByRole('region', { name: 'CPI and SPI trend' }));
    expect(trend.getByText('Record at least two status updates to see trends')).toBeInTheDocument();
    const sCurve = within(screen.getByRole('region', { name: 'S-curve' }));
    const canvas = sCurve.getByRole('img');
    expect(canvas).toHaveAttribute(
      'data-series',
      'Planned value (PV)|Earned value (EV)|Actual cost (AC)|Budget (BAC)|Forecast (EAC)',
    );
    expect(canvas).toHaveAccessibleName(/S-curve from 2026-01-01 to 2026-06-30/);
    expect(
      screen.getByText('No snapshots yet. Use “Record status” to save one.'),
    ).toBeInTheDocument();
  });

  it('CT-DASH-09 every chart has a description for screen readers and a "how to read" tip', async () => {
    await renderApp({ documents: [sample()], page: 'dashboard' });
    for (const name of [
      'S-curve',
      'Estimated vs actual cost',
      'CPI and SPI trend',
      'Cost variance by category',
    ]) {
      const card = within(screen.getByRole('region', { name }));
      expect(card.getByRole('img')).toHaveAccessibleName(/.{30,}/);
      expect(
        card.getByRole('button', { name: `How to read: ${name}` }),
      ).toHaveAccessibleDescription(/.{40,}/);
    }
  });

  it('CT-DASH-10 task results table: sortable, negatives in red, totals row (FR-12)', async () => {
    const { user } = await renderApp({ documents: [sample()], page: 'dashboard' });
    const table = within(screen.getByRole('table', { name: 'Task results (PKR)' }));
    const firstId = () => table.getAllByRole('row')[1]!.querySelector('td')!.textContent;
    expect(firstId()).toBe('1.1');

    await user.click(table.getByRole('button', { name: /^Variance/ }));
    expect(firstId()).toBe('2.2'); // most negative variance first
    expect(table.getByRole('columnheader', { name: /^Variance/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await user.click(table.getByRole('button', { name: /^Variance/ }));
    expect(firstId()).toBe('4.1'); // largest positive first (120,000 budget, nothing spent)

    const row = table.getByText('2.2').closest('tr')!;
    // Variance and CV are both −22,000 for 2.2 (100% complete)
    for (const cell of within(row).getAllByText('-22,000.00'))
      expect(cell).toHaveClass('text-error-strong');
    expect(within(row).getByText('Over budget')).toBeInTheDocument();

    const total = table.getByText('Total (12 tasks)').closest('tr')!;
    expect(within(total).getByText('1,040,000.00')).toBeInTheDocument();
    expect(within(total).getByText('570,000.00')).toBeInTheDocument();
    expect(within(total).getByText('0.87')).toBeInTheDocument();
  });

  it('CT-DASH-11 snapshot history lists CPI/SPI and delete needs confirmation (FR-17)', async () => {
    const { user } = await renderApp({ documents: [sample()], page: 'dashboard' });
    const history = within(screen.getByRole('table', { name: 'Snapshot history' }));
    expect(history.getAllByRole('row')).toHaveLength(7);
    const latest = history.getAllByRole('row')[1]!;
    expect(within(latest).getByText('2026-04-03')).toBeInTheDocument();
    expect(within(latest).getByText('0.87')).toHaveClass('text-error-strong');

    await user.click(history.getByRole('button', { name: 'Delete snapshot 2026-01-23' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Delete snapshot?' }));
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    expect(history.getAllByRole('row')).toHaveLength(7);

    await user.click(history.getByRole('button', { name: 'Delete snapshot 2026-01-23' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete snapshot' }),
    );
    expect(history.getAllByRole('row')).toHaveLength(6);
  });

  it('CT-DASH-12 everything recalculates when the status date changes (FR-15, FR-24)', async () => {
    const { user } = await renderApp({ documents: [sample()], page: 'dashboard' });
    const input = screen.getByLabelText('Status date');
    await user.clear(input);
    await user.type(input, '2026-06-26');
    // At the end date PV = BAC, so SPI = EV / BAC = 0.48
    await waitFor(() => expect(kpi('SPI').getByTestId('metric-value')).toHaveTextContent('0.48'));
    expect(kpi('SPI').getByText('Action needed')).toBeInTheDocument();
  });

  it('CT-DASH-13 the formula help panel lists each metric (FR-16)', async () => {
    const { user } = await renderApp({ documents: [sample()], page: 'dashboard' });
    await user.click(screen.getByRole('button', { name: 'How is this calculated?' }));
    const panel = within(await screen.findByRole('dialog', { name: 'How is this calculated?' }));
    expect(panel.getByText('Cost performance index')).toBeInTheDocument();
    expect(panel.getByText('EV ÷ AC')).toBeInTheDocument();
    expect(panel.getByText('(BAC − EV) ÷ (BAC − AC)')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('CT-DASH-14 charts register PNG images for the report (Phase 6)', async () => {
    let images: ChartImages | null = null;
    function Probe() {
      images = useChartImages();
      return null;
    }
    window.localStorage.setItem('evm.currentProject', 'sample');
    render(
      <Providers storage={new MemoryProjectStorage([sample()])}>
        <Probe />
        <DashboardPage onNavigate={() => {}} />
      </Providers>,
    );
    await screen.findByRole('region', { name: 'S-curve' });
    expect(images!.getImage('s-curve')).toBe('data:image/png;base64,line');
    expect(Object.keys(images!.getAll()).sort()).toEqual([
      'cost-by-task',
      'cpi-spi-trend',
      's-curve',
      'variance-by-category',
    ]);
  });
});
