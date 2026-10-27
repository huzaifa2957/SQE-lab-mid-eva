import {
  classifyVariance,
  formatNumber,
  formatPercent,
  NA_REASONS,
  type Project,
  type Task,
  TASK_CATEGORIES,
  type TaskField,
  type TaskMetrics,
  type ValidationIssue,
} from '@evm/core';
import { Check, Pencil, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { Badge, type Tone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import {
  type DraftValidation,
  draftFromTask,
  emptyDraft,
  type TaskDraft,
  validateDraft,
} from '../../lib/taskDraft';

interface TaskTableProps {
  tasks: readonly Task[];
  metrics: readonly TaskMetrics[];
  project: Pick<Project, 'startDate' | 'endDate'>;
  /** Called with the validated task and any warnings (VR-10/11/12) to show. */
  onSave: (task: Task, index: number | null, warnings: readonly ValidationIssue[]) => void;
  onDelete: (index: number) => void;
}

interface EditState {
  /** null = new row */
  index: number | null;
  draft: TaskDraft;
  validation: DraftValidation | null;
}

const VARIANCE_BADGE: Record<string, { tone: Tone; label: string }> = {
  favourable: { tone: 'success', label: 'Under budget' },
  neutral: { tone: 'success', label: 'On budget' },
  unfavourable: { tone: 'error', label: 'Over budget' },
};

export function TaskTable({ tasks, metrics, project, onSave, onDelete }: TaskTableProps) {
  const [edit, setEdit] = useState<EditState | null>(null);

  const startAdd = () =>
    setEdit({
      index: null,
      draft: emptyDraft({ plannedStart: project.startDate, plannedFinish: project.startDate }),
      validation: null,
    });
  const startEdit = (index: number) =>
    setEdit({ index, draft: draftFromTask(tasks[index]!), validation: null });
  const cancel = () => setEdit(null);

  const save = () => {
    if (!edit) return;
    const others = tasks.filter((_, i) => i !== edit.index);
    const validation = validateDraft(edit.draft, others, project);
    if (!validation.task) {
      setEdit({ ...edit, validation });
      return;
    }
    onSave(validation.task, edit.index, validation.warnings);
    setEdit(null);
  };

  const change = (field: TaskField, value: string) =>
    setEdit((e) => (e ? { ...e, draft: { ...e.draft, [field]: value } } : e));

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      cancel();
    }
  };

  const editor = (rowKey: string) =>
    edit && (
      <EditorRow
        key={rowKey}
        edit={edit}
        onChange={change}
        onSave={save}
        onCancel={cancel}
        onKeyDown={onKeyDown}
      />
    );

  return (
    <div className="flex flex-col">
      <Table aria-label="Tasks">
        <THead>
          <Tr>
            <Th>Task ID</Th>
            <Th>Name</Th>
            <Th>Category</Th>
            <Th numeric>Budget</Th>
            <Th>Planned start</Th>
            <Th>Planned finish</Th>
            <Th numeric>% Complete</Th>
            <Th numeric>Actual cost</Th>
            <Th numeric>Variance</Th>
            <Th numeric>% Variance</Th>
            <Th>Status</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </Tr>
        </THead>
        <TBody>
          {tasks.map((task, index) => {
            if (edit?.index === index) return editor(`edit-${task.id}`);
            const m = metrics[index];
            const status = classifyVariance(m?.variance ?? null);
            const badge = status
              ? VARIANCE_BADGE[status]!
              : { tone: 'neutral' as Tone, label: 'N/A' };
            return (
              <Tr key={task.id}>
                <Td mono>{task.id}</Td>
                <Td className="min-w-40">{task.name}</Td>
                <Td>{task.category}</Td>
                <Td numeric>{formatNumber(task.budget)}</Td>
                <Td mono>{task.plannedStart}</Td>
                <Td mono>{task.plannedFinish}</Td>
                <Td numeric>{formatPercent(task.percentComplete)}</Td>
                <Td numeric>{formatNumber(task.actualCost)}</Td>
                <Td numeric>{formatNumber(m?.variance)}</Td>
                <Td
                  numeric
                  title={m?.variancePercent === null ? NA_REASONS.variancePercent : undefined}
                >
                  {formatPercent(m?.variancePercent)}
                </Td>
                <Td>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Pencil}
                      iconOnly
                      onClick={() => startEdit(index)}
                      disabled={edit !== null}
                    >
                      {`Edit task ${task.id}`}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      iconOnly
                      onClick={() => onDelete(index)}
                      disabled={edit !== null}
                    >
                      {`Delete task ${task.id}`}
                    </Button>
                  </div>
                </Td>
              </Tr>
            );
          })}
          {edit?.index === null && editor('new')}
          {tasks.length === 0 && !edit && (
            <Tr>
              <Td colSpan={12} className="py-10 text-center text-muted">
                No tasks yet. Add one, or import a CSV or Excel file.
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
      <div className="border-t border-border p-4">
        <Button variant="secondary" icon={Plus} onClick={startAdd} disabled={edit !== null}>
          Add task
        </Button>
      </div>
    </div>
  );
}

interface EditorRowProps {
  edit: EditState;
  onChange: (field: TaskField, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
}

function EditorRow({ edit, onChange, onSave, onCancel, onKeyDown }: EditorRowProps) {
  const { draft, validation } = edit;
  const errors = validation?.fieldErrors ?? {};
  const categories = [...new Set([...TASK_CATEGORIES, draft.category].filter(Boolean))];
  const field = (name: TaskField, label: string, props: Record<string, unknown> = {}) => (
    <Input
      label={label}
      hideLabel
      value={draft[name]}
      error={errors[name]}
      onChange={(event) => onChange(name, event.target.value)}
      onKeyDown={onKeyDown}
      className="h-9"
      {...props}
    />
  );

  return (
    <>
      <Tr className="bg-card-subtle" data-editing="true">
        <Td className="min-w-28">
          {field('id', 'Task ID', {
            className: 'h-9 font-mono',
            'data-autofocus': true,
            autoFocus: true,
          })}
        </Td>
        <Td className="min-w-44">{field('name', 'Task name')}</Td>
        <Td className="min-w-36">
          <Select
            label="Category"
            hideLabel
            value={draft.category}
            error={errors.category}
            options={categories.map((c) => ({ value: c, label: c }))}
            onChange={(event) => onChange('category', event.target.value)}
            onKeyDown={onKeyDown}
            className="h-9"
          />
        </Td>
        <Td className="min-w-32">
          {field('budget', 'Budget', {
            inputMode: 'decimal',
            className: 'h-9 text-right font-mono',
          })}
        </Td>
        <Td className="min-w-40">{field('plannedStart', 'Planned start', { type: 'date' })}</Td>
        <Td className="min-w-40">{field('plannedFinish', 'Planned finish', { type: 'date' })}</Td>
        <Td className="min-w-28">
          {field('percentComplete', '% Complete', {
            inputMode: 'decimal',
            className: 'h-9 text-right font-mono',
          })}
        </Td>
        <Td className="min-w-32">
          {field('actualCost', 'Actual cost', {
            inputMode: 'decimal',
            className: 'h-9 text-right font-mono',
          })}
        </Td>
        <Td colSpan={3} className="text-support text-muted">
          Enter to save · Esc to cancel
        </Td>
        <Td>
          <div className="flex justify-end gap-1">
            <Button variant="primary" size="sm" icon={Check} iconOnly onClick={onSave}>
              Save task
            </Button>
            <Button variant="ghost" size="sm" icon={X} iconOnly onClick={onCancel}>
              Cancel editing
            </Button>
          </div>
        </Td>
      </Tr>
      {validation && (validation.rowErrors.length > 0 || validation.warnings.length > 0) && (
        <Tr className="bg-card-subtle">
          <Td colSpan={12} className="pt-0">
            <ul className="flex flex-col gap-1">
              {validation.rowErrors.map((text) => (
                <li key={text} className="text-support text-error-strong">
                  {text}
                </li>
              ))}
              {validation.warnings.map((issue) => (
                <li
                  key={issue.message}
                  className="flex items-center gap-1 text-support text-warning-strong"
                >
                  <TriangleAlert size={13} aria-hidden="true" />
                  {issue.detail ?? issue.message}
                </li>
              ))}
            </ul>
          </Td>
        </Tr>
      )}
    </>
  );
}
