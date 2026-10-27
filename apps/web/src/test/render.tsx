import { createProjectDocument, type ProjectDocument, type Task } from '@evm/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import App from '../App';
import { MemoryProjectStorage } from '../lib/storage';
import type { PageId } from '../state/navigation';

export const sampleTasks: Task[] = [
  {
    id: '1.1',
    name: 'Requirements',
    category: 'Labour',
    budget: 50_000,
    plannedStart: '2026-01-05',
    plannedFinish: '2026-01-20',
    percentComplete: 100,
    actualCost: 52_000,
  },
  {
    id: '1.2',
    name: 'Design',
    category: 'Labour',
    budget: 80_000,
    plannedStart: '2026-01-21',
    plannedFinish: '2026-02-15',
    percentComplete: 60,
    actualCost: 55_000,
  },
];

export function makeDocument(overrides: Partial<ProjectDocument> = {}, id = 'p1'): ProjectDocument {
  return {
    ...createProjectDocument(
      {
        name: 'Office Fit-out',
        currency: 'USD',
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        statusDate: '2026-02-01',
      },
      { id, now: '2026-02-01T00:00:00.000Z' },
    ),
    tasks: sampleTasks,
    ...overrides,
  };
}

/** Renders the whole app on a page with an in-memory store, waiting until projects are loaded. */
export async function renderApp({
  documents = [makeDocument()],
  page = 'data',
}: { documents?: ProjectDocument[]; page?: PageId } = {}) {
  window.location.hash = `/${page}`;
  if (documents[0]) window.localStorage.setItem('evm.currentProject', documents[0].project.id);
  const storage = new MemoryProjectStorage(documents);
  const user = userEvent.setup({ applyAccept: false });
  const view = render(<App storage={storage} />);
  if (documents.length > 0) {
    await waitFor(() =>
      expect(screen.getByTestId('current-project')).toHaveTextContent(documents[0]!.project.name),
    );
  }
  return { ...view, user, storage };
}
