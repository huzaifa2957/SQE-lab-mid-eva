// Shared fakes for the desktop unit tests (no Electron needed).

import {
  buildSummaryRequest,
  computeProjectMetrics,
  computeTaskMetrics,
  detectAnomalies,
  type Task,
} from '@evm/core';
import type { FileLogger } from '../src/main/logger';

const tasks: Task[] = [
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
];
const project = { name: 'Office Fit-out', currency: 'USD', statusDate: '2026-02-01' };

export const validRequest = buildSummaryRequest({
  project,
  tasks,
  taskMetrics: tasks.map((t) => computeTaskMetrics(t, project.statusDate)),
  metrics: computeProjectMetrics(tasks, project.statusDate),
  snapshots: [],
  anomalies: detectAnomalies({ tasks }),
});

export const aiSummary = {
  executiveSummary: 'Slightly over budget.',
  keyRisks: ['Overrun on requirements', 'Little float left'],
  recommendations: ['Review costs', 'Re-plan', 'Report the EAC'],
};

export function memoryLogger(): FileLogger & { lines: string[] } {
  const lines: string[] = [];
  return {
    dir: '/logs',
    lines,
    info: (m) => lines.push(`INFO ${m}`),
    error: (m, e) => lines.push(`ERROR ${m}${e instanceof Error ? ` — ${e.message}` : ''}`),
  };
}
