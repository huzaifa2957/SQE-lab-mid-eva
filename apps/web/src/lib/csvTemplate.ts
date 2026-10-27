import { TASK_COLUMNS } from '@evm/core';
import Papa from 'papaparse';
import { TEMPLATE_EXAMPLE } from './excel';

/** tasks_template.csv: the task column headers plus one example row (FR-04). */
export function buildTasksTemplateCsv(): string {
  const csv = Papa.unparse(
    { fields: TASK_COLUMNS.map((c) => c.label), data: [TEMPLATE_EXAMPLE.task] },
    { newline: '\n' },
  );
  return `${csv}\n`;
}
