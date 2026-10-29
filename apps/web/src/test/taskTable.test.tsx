import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeDocument, renderApp } from './render';

const totals = () => within(screen.getByRole('region', { name: 'Totals' }));
const tasksTable = () => within(screen.getByRole('table', { name: 'Tasks' }));

describe('Data page task table (FR-02, FR-12, FR-15)', () => {
  it('CT-TASK-01 shows per-task and total estimated, actual, variance and % variance from core', async () => {
    await renderApp();
    // BAC 130,000; AC 107,000; variance 23,000; 17.69%
    expect(totals().getByText('$130,000.00')).toBeInTheDocument();
    expect(totals().getByText('$107,000.00')).toBeInTheDocument();
    expect(totals().getByText('$23,000.00')).toBeInTheDocument();
    expect(totals().getByText('17.69%')).toBeInTheDocument();

    const row = tasksTable().getByText('1.1').closest('tr')!;
    expect(within(row).getByText('-2,000.00')).toBeInTheDocument();
    expect(within(row).getByText('-4.00%')).toBeInTheDocument();
    expect(within(row).getByText('Over budget')).toBeInTheDocument();
    const row2 = tasksTable().getByText('1.2').closest('tr')!;
    expect(within(row2).getByText('Under budget')).toBeInTheDocument();
  });

  it('CT-TASK-02 inline validation shows core messages next to the fields and blocks saving', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Add task' }));

    await user.type(screen.getByLabelText('Task ID'), '1.1'); // duplicate
    await user.type(screen.getByLabelText('Task name'), 'Testing');
    await user.type(screen.getByLabelText('Budget'), 'abc');
    await user.clear(screen.getByLabelText('% Complete'));
    await user.type(screen.getByLabelText('% Complete'), '120');
    await user.click(screen.getByRole('button', { name: 'Save task' }));

    expect(screen.getByLabelText('Task ID')).toHaveAccessibleDescription(
      'value "1.1" is already used in row 1; Task IDs must be unique',
    );
    expect(screen.getByLabelText('Budget')).toHaveAccessibleDescription(
      'value "abc" is not a valid number',
    );
    expect(screen.getByLabelText('Budget')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('% Complete')).toHaveAccessibleDescription(
      'value 120 must be between 0 and 100',
    );
    expect(tasksTable().getAllByRole('row')).toHaveLength(4); // header, 2 tasks, editor (not saved)
  });

  it('CT-TASK-03 a corrected row saves, accepts "1,200"-style numbers and updates the totals', async () => {
    const { user, storage } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    await user.type(screen.getByLabelText('Task ID'), '1.3');
    await user.type(screen.getByLabelText('Task name'), 'Testing');
    await user.selectOptions(screen.getByLabelText('Category'), 'Material');
    await user.type(screen.getByLabelText('Budget'), 'Rs 20,000');
    await user.clear(screen.getByLabelText('Planned finish'));
    await user.type(screen.getByLabelText('Planned finish'), '2026-01-31');
    await user.type(screen.getByLabelText('% Complete'), '{Enter}');

    await waitFor(() => expect(tasksTable().getByText('1.3')).toBeInTheDocument());
    expect(totals().getByText('$150,000.00')).toBeInTheDocument();

    // auto-saved (FR-08)
    await waitFor(async () => {
      const [stored] = (await storage.loadAll()) as {
        tasks: { id: string; budget: number; category: string }[];
      }[];
      expect(stored!.tasks.at(-1)).toMatchObject({
        id: '1.3',
        budget: 20_000,
        category: 'Material',
      });
    });
  });

  it('CT-TASK-04 editing and deleting with undo', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Edit task 1.2' }));
    const actual = screen.getByRole('textbox', { name: 'Actual cost' });
    await user.clear(actual);
    await user.type(actual, '90000');
    await user.click(screen.getByRole('button', { name: 'Save task' }));
    expect(
      within(tasksTable().getByText('1.2').closest('tr')!).getByText('Over budget'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete task 1.1' }));
    expect(tasksTable().queryByText('1.1')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(tasksTable().getByText('1.1')).toBeInTheDocument();
  });

  it('CT-TASK-05 Esc cancels editing without saving', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Edit task 1.1' }));
    await user.clear(screen.getByLabelText('Task name'));
    await user.type(screen.getByLabelText('Task name'), 'Changed{Escape}');
    expect(tasksTable().getByText('Requirements')).toBeInTheDocument();
  });

  it('CT-TASK-06 changing the status date recalculates; an invalid one shows the VR-09 message', async () => {
    const { user } = await renderApp();
    const input = screen.getByLabelText('Status date');
    await user.clear(input);
    await user.type(input, '2025-12-01');
    expect(input).toHaveAccessibleDescription(
      'value 2025-12-01 must be on or after the start date (2026-01-01)',
    );
    expect(screen.getByTestId('current-project').parentElement).toHaveTextContent(
      'Status date 2026-02-01',
    );

    await user.clear(input);
    await user.type(input, '2026-03-01');
    await waitFor(() =>
      expect(screen.getByTestId('current-project').parentElement).toHaveTextContent(
        'Status date 2026-03-01',
      ),
    );
  });

  it('CT-TASK-07 Record status saves a snapshot and asks before replacing one for the same date', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: 'Record status' }));
    const snapshots = within(await screen.findByRole('table', { name: 'Recorded snapshots' }));
    expect(snapshots.getByText('2026-02-01')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Record status' }));
    const dialog = await screen.findByRole('dialog', { name: 'Replace snapshot?' });
    await user.click(within(dialog).getByRole('button', { name: 'Replace snapshot' }));
    expect(snapshots.getAllByText('2026-02-01')).toHaveLength(1);
  });

  it('CT-TASK-08 with no project, Data asks the user to choose one', async () => {
    await renderApp({ documents: [] });
    expect(screen.getByText('Choose or create a project first')).toBeInTheDocument();
  });

  it('CT-TASK-09 N/A % variance has a reason tooltip (FR-13)', async () => {
    await renderApp({
      documents: [
        makeDocument({
          tasks: [
            { ...makeDocument().tasks[0]!, budget: 0, actualCost: 0, percentComplete: 0 },
            makeDocument().tasks[1]!,
          ],
        }),
      ],
    });
    const cell = within(tasksTable().getByText('1.1').closest('tr')!).getAllByText('N/A')[0]!;
    expect(cell.closest('td')).toHaveAttribute('title', expect.stringContaining('Budget is 0'));
  });
});
