// Inline task editing (FR-02). A draft row is validated by running the core sheet validator
// over the whole table, so editing uses exactly the same rules and messages as file import.

import {
  type Project,
  type Task,
  TASK_COLUMNS,
  type TaskField,
  type ValidationIssue,
  validateTaskRows,
} from '@evm/core';

export type TaskDraft = Record<TaskField, string>;

export function draftFromTask(task: Task): TaskDraft {
  return {
    id: task.id,
    name: task.name,
    category: task.category,
    budget: String(task.budget),
    plannedStart: task.plannedStart,
    plannedFinish: task.plannedFinish,
    percentComplete: String(task.percentComplete),
    actualCost: String(task.actualCost),
  };
}

export function emptyDraft(defaults: Partial<TaskDraft> = {}): TaskDraft {
  return {
    id: '',
    name: '',
    category: 'Labour',
    budget: '',
    plannedStart: '',
    plannedFinish: '',
    percentComplete: '0',
    actualCost: '0',
    ...defaults,
  };
}

export interface DraftValidation {
  task: Task | null;
  /** First error per field, without the row/column prefix. */
  fieldErrors: Partial<Record<TaskField, string>>;
  /** Errors not tied to a column (shown above the row). */
  rowErrors: string[];
  warnings: ValidationIssue[];
}

const FIELD_BY_LABEL = new Map(TASK_COLUMNS.map((c) => [c.label, c.field]));

/**
 * Validates `draft` against the other tasks in the table (for unique IDs etc.).
 * The draft is placed last so that a duplicate ID is always reported on the draft itself.
 */
export function validateDraft(
  draft: TaskDraft,
  otherTasks: readonly Task[],
  project?: Pick<Project, 'startDate' | 'endDate'>,
): DraftValidation {
  const drafts = [...otherTasks.map(draftFromTask), draft];
  const result = validateTaskRows(
    {
      headers: TASK_COLUMNS.map((c) => c.label),
      rows: drafts.map((d) => TASK_COLUMNS.map((c) => d[c.field])),
    },
    { project, percentAsFraction: false, headerRowNumber: 0 },
  );

  const row = drafts.length;
  const mine = (issue: ValidationIssue) => issue.row === row;
  const fieldErrors: Partial<Record<TaskField, string>> = {};
  const rowErrors: string[] = [];
  for (const issue of result.errors.filter(mine)) {
    const field = issue.column ? FIELD_BY_LABEL.get(issue.column) : undefined;
    const text = issue.detail ?? issue.message;
    if (field) fieldErrors[field] ??= text;
    else rowErrors.push(text);
  }

  const valid = Object.keys(fieldErrors).length === 0 && rowErrors.length === 0;
  return {
    task: valid ? (result.tasks.at(-1) ?? null) : null,
    fieldErrors,
    rowErrors,
    warnings: result.warnings.filter(mine),
  };
}
