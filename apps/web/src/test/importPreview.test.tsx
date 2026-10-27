import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import invalidPercent from '../../../../samples/invalid_percent_over_100.csv?raw';
import sampleTasks from '../../../../samples/sample_project.csv?raw';
import { makeDocument, renderApp } from './render';

const csvFile = (text: string, name: string) => new File([text], name, { type: 'text/csv' });

async function openImport() {
  const app = await renderApp();
  await app.user.click(screen.getByRole('button', { name: 'Import file' }));
  const dialog = await screen.findByRole('dialog', { name: 'Import tasks' });
  return { ...app, dialog: within(dialog) };
}

describe('file import preview (FR-03, FR-05, FR-06)', () => {
  it('CT-IMP-01 a valid sample file previews with no errors and imports (with confirm + undo)', async () => {
    const { user, dialog } = await openImport();
    await user.upload(
      dialog.getByLabelText('Upload task file'),
      csvFile(sampleTasks, 'sample_project.csv'),
    );

    expect(await dialog.findByText('12 task rows')).toBeInTheDocument();
    expect(dialog.getByText('No errors')).toBeInTheDocument();
    expect(dialog.getByText('1 warning')).toBeInTheDocument();
    expect(
      dialog.getByText(/Row 10, 'Actual Cost': actual cost 4,000.00 has been spent/),
    ).toBeInTheDocument();
    const preview = within(dialog.getByRole('table', { name: 'Import preview' }));
    expect(preview.getAllByRole('row')).toHaveLength(13);
    expect(preview.getByText('Structural steel').closest('tr')).not.toHaveAttribute('data-tone');
    expect(preview.getByText('Plumbing rough-in').closest('tr')).toHaveAttribute(
      'data-tone',
      'warning',
    );

    const importButton = dialog.getByRole('button', { name: 'Import' });
    expect(importButton).toBeEnabled();
    await user.click(importButton);
    // existing tasks → confirmation
    expect(dialog.getByText(/Replace the 2 existing tasks with 12 tasks/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Replace data' }));

    const tasks = within(screen.getByRole('table', { name: 'Tasks' }));
    await waitFor(() => expect(tasks.getByText('Handover and commissioning')).toBeInTheDocument());
    expect(tasks.getAllByRole('row')).toHaveLength(13);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(tasks.getAllByRole('row')).toHaveLength(3));
  });

  it('CT-IMP-02 an invalid sample file shows the exact core message, tints the row and blocks import', async () => {
    const { user, dialog } = await openImport();
    await user.upload(
      dialog.getByLabelText('Upload task file'),
      csvFile(invalidPercent, 'invalid_percent_over_100.csv'),
    );

    expect(await dialog.findByText('1 error')).toBeInTheDocument();
    expect(
      dialog.getByText("Row 3, '% Complete': value 120 must be between 0 and 100"),
    ).toBeInTheDocument();
    const preview = within(dialog.getByRole('table', { name: 'Import preview' }));
    expect(preview.getByText('120').closest('tr')).toHaveAttribute('data-tone', 'error');
    expect(dialog.getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('CT-IMP-03 wrong file types are rejected before parsing (VR-01)', async () => {
    const { user, dialog } = await openImport();
    await user.upload(
      dialog.getByLabelText('Upload task file'),
      new File(['hello'], 'notes.txt', { type: 'text/plain' }),
    );
    expect(await dialog.findByText('File rejected')).toBeInTheDocument();
    expect(
      dialog.getByText('File "notes.txt" is not supported. Upload a .csv or .xlsx file.'),
    ).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('CT-IMP-04 a corrupt .xlsx is reported, not crashed on', async () => {
    const { user, dialog } = await openImport();
    const fake = new File(['this is not a zip'], 'broken.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await user.upload(dialog.getByLabelText('Upload task file'), fake);
    // ExcelJS is loaded on demand, which can take a moment the first time.
    expect(
      await dialog.findByText(/"broken.xlsx" could not be read as an Excel workbook/, undefined, {
        timeout: 10_000,
      }),
    ).toBeInTheDocument();
  }, 20_000);

  it('CT-IMP-05 fraction-like percentages need confirmation before import (VR-07)', async () => {
    const { user, dialog } = await openImport();
    const text = [
      'Task ID,Task Name,Budget,Planned Start,Planned Finish,% Complete,Actual Cost',
      'A,Alpha,1000,2026-01-05,2026-01-20,0.5,400',
      'B,Beta,1000,2026-01-05,2026-01-20,0.25,200',
    ].join('\n');
    await user.upload(dialog.getByLabelText('Upload task file'), csvFile(text, 'fractions.csv'));

    expect(await dialog.findByText('Are the % Complete values fractions?')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Import' })).toBeDisabled();
    await user.click(dialog.getByRole('button', { name: 'Yes, convert (0.45 → 45%)' }));
    expect(dialog.getByRole('button', { name: 'Import' })).toBeEnabled();
    await user.click(dialog.getByRole('button', { name: 'Import' }));
    await user.click(dialog.getByRole('button', { name: 'Replace data' }));

    const row = within(screen.getByRole('table', { name: 'Tasks' }))
      .getByText('Alpha')
      .closest('tr')!;
    expect(within(row).getByText('50.00%')).toBeInTheDocument();
  });

  it('CT-IMP-06 importing into an empty project needs no confirmation', async () => {
    const { user } = await renderApp({ documents: [makeDocument({ tasks: [] })] });
    await user.click(screen.getByRole('button', { name: 'Import file' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Import tasks' }));
    await user.upload(
      dialog.getByLabelText('Upload task file'),
      csvFile(sampleTasks, 'sample_project.csv'),
    );
    await user.click(await dialog.findByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Imported 12 tasks')).toBeInTheDocument();
  });
});
