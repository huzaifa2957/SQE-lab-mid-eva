// Worked example from docs/test-cases.md §2. Keep the two in sync.

import type { Project, Task } from '../../src';

export const workedProject: Project = {
  id: 'we-1',
  name: 'Worked Example — Office Fit-out',
  currency: 'USD',
  startDate: '2026-01-01',
  endDate: '2026-04-30',
  statusDate: '2026-03-11',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-03-11T00:00:00.000Z',
};

export const workedTasks: Task[] = [
  {
    id: 'T1',
    name: 'Site survey',
    category: 'Labour',
    budget: 10_000,
    plannedStart: '2026-01-01',
    plannedFinish: '2026-01-31',
    percentComplete: 100,
    actualCost: 12_000,
  },
  {
    id: 'T2',
    name: 'Partition walls',
    category: 'Subcontract',
    budget: 20_000,
    plannedStart: '2026-03-01',
    plannedFinish: '2026-03-21',
    percentComplete: 40,
    actualCost: 10_000,
  },
  {
    id: 'T3',
    name: 'Electrical',
    category: 'Subcontract',
    budget: 40_000,
    plannedStart: '2026-03-01',
    plannedFinish: '2026-04-10',
    percentComplete: 20,
    actualCost: 12_000,
  },
  {
    id: 'T4',
    name: 'Furniture',
    category: 'Material',
    budget: 20_000,
    plannedStart: '2026-04-01',
    plannedFinish: '2026-04-30',
    percentComplete: 0,
    actualCost: 0,
  },
  {
    id: 'T5',
    name: 'Permit approval (milestone)',
    category: 'Other',
    budget: 10_000,
    plannedStart: '2026-03-05',
    plannedFinish: '2026-03-05',
    percentComplete: 60,
    actualCost: 6_000,
  },
];
