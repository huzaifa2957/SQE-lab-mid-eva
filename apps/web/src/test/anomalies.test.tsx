import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildSampleDocument } from '../lib/sampleProject';
import { makeDocument, renderApp } from './render';

const sample = () => buildSampleDocument('sample', '2026-04-03T00:00:00.000Z');

const unusualCard = () =>
  screen.getByRole('heading', { name: 'Unusual expenses' }).closest('section') as HTMLElement;

describe('Unusual expenses (FR-31)', () => {
  it('CT-ANO-01 lists anomalies most severe first with rule ID, task, severity badge and reason', async () => {
    await renderApp({ documents: [sample()], page: 'insights' });
    const table = screen.getByRole('table', { name: 'Unusual expenses' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.getAttribute('data-rule'))).toEqual(['AN-01', 'AN-02']);

    const first = within(rows[0]!);
    expect(first.getByText('AN-01')).toHaveClass('font-mono');
    expect(first.getByText('Task 3.1')).toHaveClass('font-mono');
    expect(first.getByText('High').closest('[data-tone]')).toHaveAttribute('data-tone', 'error');
    expect(
      first.getByText(/cost variance of -157\.14%, far from the other tasks/),
    ).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Medium').closest('[data-tone]')).toHaveAttribute(
      'data-tone',
      'warning',
    );
    expect(
      within(rows[1]!).getByText(/has spent PKR 4,000\.00 but is 0% complete/),
    ).toBeInTheDocument();
  });

  it('CT-ANO-02 shows count badges by severity (icon + text)', async () => {
    await renderApp({ documents: [sample()], page: 'insights' });
    const counts = within(screen.getByRole('list', { name: 'Unusual expenses by severity' }));
    expect(counts.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '1 high',
      '1 medium',
      '0 low',
    ]);
    expect(counts.getByText('1 high').querySelector('svg')).not.toBeNull();
  });

  it('CT-ANO-03 clicking a row (or its button) opens the task on the Data page and highlights it', async () => {
    const { user } = await renderApp({ documents: [sample()], page: 'insights' });
    const row = within(screen.getByRole('table', { name: 'Unusual expenses' }))
      .getByText('Task 3.2')
      .closest('tr')!;
    await user.click(row);
    expect(window.location.hash).toBe('#/data?task=3.2');
    const target = await waitFor(() => {
      const el = document.getElementById('task-row-3.2');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(target).toHaveAttribute('data-focused', 'true');
    await waitFor(() => expect(target).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Insights' }));
    await user.click(await screen.findByRole('button', { name: 'Open task 3.1 on the Data page' }));
    expect(window.location.hash).toBe('#/data?task=3.1');
  });

  it('CT-ANO-04 snapshot-level anomalies (AN-04) show the date and are not links', async () => {
    const snapshots = [100, 200, 300, 1300].map((ac, i) => ({
      date: `2026-01-0${i + 1}`,
      pv: ac,
      ev: ac,
      ac,
    }));
    await renderApp({ documents: [makeDocument({ snapshots })], page: 'insights' });
    const row = within(screen.getByRole('table', { name: 'Unusual expenses' }))
      .getAllByRole('row')
      .find((r) => r.getAttribute('data-rule') === 'AN-04')!;
    expect(within(row).getByText('2026-01-04')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('CT-ANO-05 empty state: "No unusual expenses found" with a success badge', async () => {
    const clean = makeDocument({
      tasks: makeDocument().tasks.map((t) => ({
        ...t,
        percentComplete: 100,
        actualCost: t.budget,
      })),
    });
    await renderApp({ documents: [clean], page: 'insights' });
    const card = within(unusualCard());
    expect(card.getByText('No unusual expenses found')).toBeInTheDocument();
    expect(card.getByText('All clear').closest('[data-tone]')).toHaveAttribute(
      'data-tone',
      'success',
    );
    expect(screen.queryByRole('table', { name: 'Unusual expenses' })).not.toBeInTheDocument();
  });
});

describe('anomaly markers in task tables (FR-31)', () => {
  it('CT-ANO-06 Data page rows with anomalies get a warning icon with the reason in a tooltip', async () => {
    const { user } = await renderApp({ documents: [sample()], page: 'data' });
    const marker = screen.getByRole('button', { name: 'Unusual expense on task 3.2' });
    expect(marker.closest('tr')).toHaveAttribute('data-tone', 'warning');
    const tip = document.getElementById(marker.getAttribute('aria-describedby')!)!;
    expect(tip).toHaveAttribute('role', 'tooltip');
    expect(tip).toHaveClass('hidden');
    await user.hover(marker);
    expect(tip).toHaveClass('block');
    // Fixed position so the table's scroll container can't clip it.
    expect(tip.style.position).toBe('fixed');
    expect(tip).toHaveTextContent(/AN-02.*has spent PKR 4,000\.00 but is 0% complete/);

    expect(screen.getAllByRole('button', { name: /^Unusual expense on task/ })).toHaveLength(2);
    const clean = document.getElementById('task-row-1.1')!;
    expect(clean).not.toHaveAttribute('data-tone');
  });

  it('CT-ANO-07 the Dashboard task results table shows the same markers', async () => {
    await renderApp({ documents: [sample()], page: 'dashboard' });
    const table = screen.getByRole('table', { name: /Task results/ });
    const marker = within(table).getByRole('button', { name: 'Unusual expense on task 3.1' });
    expect(marker.closest('tr')).toHaveAttribute('data-tone', 'warning');
    const tip = document.getElementById(marker.getAttribute('aria-describedby')!)!;
    act(() => marker.focus());
    expect(marker).toHaveAttribute('aria-expanded', 'true');
    expect(tip).toHaveClass('block');
    expect(tip).toHaveTextContent(/AN-01.*far from the other tasks/);
  });
});
