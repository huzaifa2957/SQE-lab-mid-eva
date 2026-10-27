import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';

describe('Projects page (FR-01, FR-09)', () => {
  it('CT-PRJ-01 creates a project, validating with the core schema (VR-09)', async () => {
    const { user } = await renderApp({ page: 'projects', documents: [] });
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'New project' })[0]!);
    const dialog = within(await screen.findByRole('dialog', { name: 'New project' }));

    await user.click(dialog.getByRole('button', { name: 'Create project' }));
    expect(dialog.getByLabelText('Project name')).toHaveAccessibleDescription(
      'a value is required',
    );

    await user.type(dialog.getByLabelText('Project name'), 'Warehouse');
    await user.clear(dialog.getByLabelText('End date'));
    await user.type(dialog.getByLabelText('End date'), '2000-01-01');
    await user.click(dialog.getByRole('button', { name: 'Create project' }));
    expect(dialog.getByLabelText('End date')).toHaveAccessibleDescription(
      /must be after the start date/,
    );

    await user.clear(dialog.getByLabelText('Start date'));
    await user.type(dialog.getByLabelText('Start date'), '2026-01-01');
    await user.clear(dialog.getByLabelText('Status date'));
    await user.type(dialog.getByLabelText('Status date'), '2026-01-15');
    await user.clear(dialog.getByLabelText('End date'));
    await user.type(dialog.getByLabelText('End date'), '2026-12-31');
    await user.selectOptions(dialog.getByLabelText('Currency'), 'USD');
    await user.click(dialog.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Warehouse' })).toBeInTheDocument();
    expect(screen.getByTestId('current-project')).toHaveTextContent('Warehouse');
  });

  it('CT-PRJ-02 edits a project', async () => {
    const { user } = await renderApp({ page: 'projects' });
    const card = within(screen.getByRole('region', { name: 'Office Fit-out' }));
    await user.click(card.getByRole('button', { name: 'Edit' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit project' }));
    const name = dialog.getByLabelText('Project name');
    await user.clear(name);
    await user.type(name, 'Office Fit-out Phase 2');
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByRole('region', { name: 'Office Fit-out Phase 2' }),
    ).toBeInTheDocument();
  });

  it('CT-PRJ-03 delete asks for confirmation and can be undone', async () => {
    const { user, storage } = await renderApp({ page: 'projects' });
    await user.click(
      within(screen.getByRole('region', { name: 'Office Fit-out' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    const dialog = within(await screen.findByRole('dialog', { name: 'Delete project?' }));
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('region', { name: 'Office Fit-out' })).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('region', { name: 'Office Fit-out' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete project' }),
    );
    expect(screen.queryByRole('region', { name: 'Office Fit-out' })).not.toBeInTheDocument();
    await waitFor(async () => expect(await storage.loadAll()).toHaveLength(0));

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('region', { name: 'Office Fit-out' })).toBeInTheDocument();
  });

  it('CT-PRJ-04 loads the sample project from samples/ (FR-09)', async () => {
    const { user } = await renderApp({ page: 'projects', documents: [] });
    await user.click(screen.getAllByRole('button', { name: 'Load sample project' })[0]!);
    const card = within(await screen.findByRole('region', { name: 'Clinic Building Extension' }));
    expect(card.getByText('12')).toBeInTheDocument();
    expect(card.getByText('PKR 1,040,000.00')).toBeInTheDocument();

    await user.click(card.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('heading', { name: 'Data', level: 1 })).toBeInTheDocument();
    expect(
      within(screen.getByRole('table', { name: 'Recorded snapshots' })).getAllByRole('row'),
    ).toHaveLength(7);
  });

  it('CT-PRJ-05 sidebar navigation marks the current page', async () => {
    const { user } = await renderApp({ page: 'projects' });
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(nav.getByRole('button', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');
    await user.click(nav.getByRole('button', { name: 'Dashboard' }));
    expect(screen.getByText('Coming in Phase 4')).toBeInTheDocument();
    expect(nav.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  });
});
