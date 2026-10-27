import { parseProjectFile, type ProjectDocument, serializeProjectFile } from '@evm/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';
import * as files from '../lib/files';
import { MemoryProjectStorage } from '../lib/storage';
import { makeDocument, renderApp } from './render';

const jsonFile = (text: string, name = 'project.evm.json') =>
  new File([text], name, { type: 'application/json' });

describe('project files (FR-08)', () => {
  it('CT-PF-01 "Save file" downloads <project>.evm.json that core can read back', async () => {
    const download = vi.spyOn(files, 'downloadText');
    const { user } = await renderApp({ page: 'projects' });
    const card = within(screen.getByRole('region', { name: 'Office Fit-out' }));
    await user.click(card.getByRole('button', { name: 'Save file' }));

    expect(download).toHaveBeenCalledTimes(1);
    const [text, fileName, type] = download.mock.calls[0]!;
    expect(fileName).toBe('Office_Fit_out.evm.json');
    expect(type).toBe('application/json');
    const parsed = parseProjectFile(text);
    expect(parsed.valid).toBe(true);
    expect(parsed.document!.tasks).toHaveLength(2);
    expect(await screen.findByText('Saved Office_Fit_out.evm.json')).toBeInTheDocument();
  });

  it('CT-PF-02 "Open project file" loads a valid file and selects it', async () => {
    const { user, storage } = await renderApp({ page: 'projects', documents: [] });
    const other = makeDocument({}, 'p2');
    other.project.name = 'Clinic Extension';
    await user.upload(
      screen.getByLabelText('Open project file'),
      jsonFile(serializeProjectFile(other)),
    );

    expect(await screen.findByText('Opened “Clinic Extension”')).toBeInTheDocument();
    expect(screen.getByTestId('current-project')).toHaveTextContent('Clinic Extension');
    await waitFor(async () => expect(await storage.loadAll()).toHaveLength(1));
  });

  it('CT-PF-03 an invalid file is rejected with the core messages and nothing changes', async () => {
    const { user, storage } = await renderApp({ page: 'projects' });
    const bad = JSON.parse(serializeProjectFile(makeDocument({}, 'p9')));
    bad.tasks[0].percentComplete = 150;
    await user.upload(
      screen.getByLabelText('Open project file'),
      jsonFile(JSON.stringify(bad), 'bad.evm.json'),
    );

    const dialog = within(await screen.findByRole('dialog', { name: 'Project file not opened' }));
    expect(
      dialog.getByText("Tasks: Row 1, '% Complete': value 150 must be between 0 and 100"),
    ).toBeInTheDocument();
    expect(await storage.loadAll()).toHaveLength(1);
  });

  it('CT-PF-04 non-JSON and wrong extensions never crash', async () => {
    const { user } = await renderApp({ page: 'projects' });
    await user.upload(screen.getByLabelText('Open project file'), jsonFile('{ nope'));
    expect(
      await screen.findByText(
        'The file is not valid JSON, so it cannot be opened as a project file.',
        {
          selector: 'span',
        },
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await user.upload(screen.getByLabelText('Open project file'), jsonFile('x', 'tasks.csv'));
    expect(
      await screen.findByText('File "tasks.csv" is not a project file. Choose a .evm.json file.'),
    ).toBeInTheDocument();
  });

  it('CT-PF-05 opening a file with an existing id asks before replacing, with undo', async () => {
    const { user } = await renderApp({ page: 'projects' });
    const changed = makeDocument();
    changed.project.name = 'Office Fit-out v2';
    await user.upload(
      screen.getByLabelText('Open project file'),
      jsonFile(serializeProjectFile(changed)),
    );

    const dialog = within(await screen.findByRole('dialog', { name: 'Replace project?' }));
    await user.click(dialog.getByRole('button', { name: 'Replace' }));
    expect(screen.getByTestId('current-project')).toHaveTextContent('Office Fit-out v2');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByTestId('current-project')).toHaveTextContent(/^Office Fit-out$/);
  });

  it('CT-PF-06 damaged data in local storage is skipped with a warning', async () => {
    const storage = new MemoryProjectStorage([makeDocument()]);
    const broken = { ...makeDocument({}, 'zz'), tasks: [{ id: '' }] } as unknown as ProjectDocument;
    await storage.save(broken);
    render(<App storage={storage} />);
    expect(await screen.findByText('1 saved project could not be loaded')).toBeInTheDocument();
    expect(screen.getByTestId('current-project')).toHaveTextContent('Office Fit-out');
  });
});
