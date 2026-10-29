import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildSampleDocument } from '../lib/sampleProject';
import { makeDocument, renderApp } from './render';

const sample = () => buildSampleDocument('sample', '2026-04-03T00:00:00.000Z');

describe('Insights page (FR-26, FR-27)', () => {
  it('CT-INS-01 groups insights red → amber → info → green, each with rule ID, numbers and a tip', async () => {
    await renderApp({ documents: [sample()], page: 'insights' });

    const groups = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(groups.slice(0, 3)).toEqual(['Action needed', 'Watch', 'For information']);

    const rules = (name: string) =>
      within(screen.getByRole('region', { name }))
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('data-rule'));
    expect(rules('Action needed')).toEqual(['IN-03', 'IN-09', 'IN-10']);
    expect(rules('Watch')).toEqual(['IN-05', 'IN-11']);
    expect(rules('For information')).toEqual(['IN-12']);

    const cpi = within(
      screen
        .getByRole('region', { name: 'Action needed' })
        .querySelector('[data-rule="IN-03"]') as HTMLElement,
    );
    expect(cpi.getByText('IN-03')).toHaveClass('font-mono');
    expect(cpi.getByText(/each 1 unit spent earns only 0\.87 of value/)).toBeInTheDocument();
    expect(cpi.getByText(/Hold a cost review now/)).toBeInTheDocument();

    expect(screen.getByText('At risk')).toBeInTheDocument();
  });

  it('CT-INS-02 a healthy project shows green insights and a Healthy badge', async () => {
    const healthy = makeDocument({
      tasks: makeDocument().tasks.map((t) => ({
        ...t,
        percentComplete: 100,
        actualCost: t.budget * 0.9,
      })),
    });
    await renderApp({ documents: [healthy], page: 'insights' });
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    const going = within(screen.getByRole('region', { name: 'Going well' }));
    expect(going.getAllByRole('listitem').map((li) => li.getAttribute('data-rule'))).toEqual([
      'IN-01',
      'IN-04',
    ]);
    expect(screen.queryByRole('region', { name: 'Action needed' })).not.toBeInTheDocument();
  });

  it('CT-INS-03 top contributors link to the task row on the dashboard (IN-12)', async () => {
    const { user } = await renderApp({ documents: [sample()], page: 'insights' });
    const list = within(screen.getByRole('list', { name: 'Top contributors to overrun' }));
    const items = list.getAllByRole('listitem');
    expect(items.map((li) => within(li).getAllByText(/^\d\.\d$/)[0]!.textContent)).toEqual([
      '2.3',
      '2.2',
      '2.4',
    ]);

    await user.click(list.getByRole('button', { name: 'View task 2.2' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/dashboard?task=2.2');
    const row = document.getElementById('task-row-2.2')!;
    expect(row).toHaveAttribute('data-focused', 'true');
    expect(row).toHaveFocus();
  });

  it('CT-INS-04 the Phase 5 section is clearly marked', async () => {
    await renderApp({ documents: [sample()], page: 'insights' });
    const section = within(screen.getByRole('region', { name: 'Unusual expenses and AI summary' }));
    expect(section.getByText('Coming in Phase 5')).toBeInTheDocument();
  });

  it('CT-INS-05 no project: empty state', async () => {
    await renderApp({ documents: [], page: 'insights' });
    expect(await screen.findByText('Create a project to see insights')).toBeInTheDocument();
  });
});
