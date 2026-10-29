// Shared request fixture for the proxy tests.

import {
  buildSummaryRequest,
  computeProjectMetrics,
  computeTaskMetrics,
  detectAnomalies,
  type Task,
} from '@evm/core';

export const tasks: Task[] = [
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

const project = { name: 'Office Fit-out', currency: 'USD', statusDate: '2026-02-01' };
export const validBody = buildSummaryRequest({
  project,
  tasks,
  taskMetrics: tasks.map((t) => computeTaskMetrics(t, project.statusDate)),
  metrics: computeProjectMetrics(tasks, project.statusDate),
  snapshots: [],
  anomalies: detectAnomalies({ tasks }),
});
