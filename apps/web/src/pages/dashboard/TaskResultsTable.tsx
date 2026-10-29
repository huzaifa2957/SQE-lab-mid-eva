import {
  type Anomaly,
  classifyVariance,
  formatIndex,
  formatNumber,
  formatPercent,
  NA_REASONS,
  type ProjectMetrics,
  type Task,
  type TaskMetrics,
} from '@evm/core';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AnomalyMarker } from '../../components/AnomalyMarker';
import { Badge, type Tone } from '../../components/ui/Badge';
import { cx } from '../../components/ui/cx';
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';

type ColumnKey =
  | 'id'
  | 'name'
  | 'estimatedCost'
  | 'actualCost'
  | 'variance'
  | 'variancePercent'
  | 'pv'
  | 'ev'
  | 'cv'
  | 'sv'
  | 'cpi'
  | 'spi';

interface Column {
  key: ColumnKey;
  label: string;
  numeric?: boolean;
  format?: 'money' | 'percent' | 'index';
}

const COLUMNS: readonly Column[] = [
  { key: 'id', label: 'Task ID' },
  { key: 'name', label: 'Name' },
  { key: 'estimatedCost', label: 'Estimated', numeric: true, format: 'money' },
  { key: 'actualCost', label: 'Actual', numeric: true, format: 'money' },
  { key: 'variance', label: 'Variance', numeric: true, format: 'money' },
  { key: 'variancePercent', label: '% Variance', numeric: true, format: 'percent' },
  { key: 'pv', label: 'PV', numeric: true, format: 'money' },
  { key: 'ev', label: 'EV', numeric: true, format: 'money' },
  { key: 'cv', label: 'CV', numeric: true, format: 'money' },
  { key: 'sv', label: 'SV', numeric: true, format: 'money' },
  { key: 'cpi', label: 'CPI', numeric: true, format: 'index' },
  { key: 'spi', label: 'SPI', numeric: true, format: 'index' },
];

const NA_TITLES: Partial<Record<ColumnKey, string>> = {
  variancePercent: NA_REASONS.variancePercent,
  cpi: NA_REASONS.cpi,
  spi: NA_REASONS.spi,
};

const STATUS: Record<string, { tone: Tone; label: string }> = {
  favourable: { tone: 'success', label: 'Under budget' },
  neutral: { tone: 'success', label: 'On budget' },
  unfavourable: { tone: 'error', label: 'Over budget' },
};

type Row = { task: Task; metrics: TaskMetrics };

function cellValue(row: Row, key: ColumnKey): string | number | null {
  if (key === 'id') return row.task.id;
  if (key === 'name') return row.task.name;
  return row.metrics[key];
}

function formatCell(value: string | number | null, format: Column['format']): string {
  if (typeof value === 'string') return value;
  if (format === 'percent') return formatPercent(value);
  if (format === 'index') return formatIndex(value);
  return formatNumber(value);
}

/** Variances below zero are shown in muted red (in addition to the minus sign). */
const NEGATIVE_KEYS = new Set<ColumnKey>(['variance', 'variancePercent', 'cv', 'sv']);

interface TaskResultsTableProps {
  tasks: readonly Task[];
  taskMetrics: readonly TaskMetrics[];
  totals: ProjectMetrics;
  currency: string;
  /** Task to scroll to and highlight (from an Insights link). */
  focusTaskId?: string;
  /** FR-31: anomalies per task ID; those rows get a warning marker. */
  anomaliesByTask?: ReadonlyMap<string, readonly Anomaly[]>;
}

/** FR-12: per-task results, sortable, with a totals row. */
export function TaskResultsTable({
  tasks,
  taskMetrics,
  totals,
  currency,
  focusTaskId,
  anomaliesByTask,
}: TaskResultsTableProps) {
  const [sort, setSort] = useState<{ key: ColumnKey; dir: 'asc' | 'desc' } | null>(null);

  const rows = useMemo(() => {
    const list: Row[] = tasks.map((task, i) => ({ task, metrics: taskMetrics[i]! }));
    if (!sort) return list;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = cellValue(a, sort.key);
      const y = cellValue(b, sort.key);
      if (x === null) return 1; // N/A always last
      if (y === null) return -1;
      if (typeof x === 'string' || typeof y === 'string')
        return String(x).localeCompare(String(y), undefined, { numeric: true }) * factor;
      return (x - y) * factor;
    });
  }, [tasks, taskMetrics, sort]);

  useEffect(() => {
    if (!focusTaskId) return;
    const row = document.getElementById(`task-row-${focusTaskId}`);
    row?.scrollIntoView?.({ block: 'center' });
    row?.focus();
  }, [focusTaskId]);

  const toggle = (key: ColumnKey) =>
    setSort((s) =>
      s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' },
    );

  const totalRow: Partial<Record<ColumnKey, number | null>> = {
    estimatedCost: totals.bac,
    actualCost: totals.ac,
    variance: totals.variance,
    variancePercent: totals.variancePercent,
    pv: totals.pv,
    ev: totals.ev,
    cv: totals.cv,
    sv: totals.sv,
    cpi: totals.cpi,
    spi: totals.spi,
  };

  return (
    <Table aria-label={`Task results (${currency})`}>
      <THead>
        <Tr>
          {COLUMNS.map((column) => {
            const active = sort?.key === column.key;
            const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
            return (
              <Th
                key={column.key}
                numeric={column.numeric}
                aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button
                  type="button"
                  onClick={() => toggle(column.key)}
                  className={cx(
                    'inline-flex items-center gap-1 rounded uppercase hover:text-text',
                    column.numeric && 'flex-row-reverse',
                    active && 'text-text',
                  )}
                >
                  {column.label}
                  <Icon size={12} aria-hidden="true" />
                </button>
              </Th>
            );
          })}
          <Th>Status</Th>
        </Tr>
      </THead>
      <TBody>
        {rows.map((row) => {
          const status = classifyVariance(row.metrics.variance);
          const badge = status ? STATUS[status]! : { tone: 'neutral' as Tone, label: 'N/A' };
          const anomalies = anomaliesByTask?.get(row.task.id);
          return (
            <Tr
              key={row.task.id}
              id={`task-row-${row.task.id}`}
              tabIndex={-1}
              tone={anomalies ? 'warning' : undefined}
              data-focused={focusTaskId === row.task.id || undefined}
              className={cx(
                focusTaskId === row.task.id && 'bg-card-subtle outline-2 outline-accent',
              )}
            >
              {COLUMNS.map((column) => {
                const value = cellValue(row, column.key);
                const negative =
                  typeof value === 'number' && value < 0 && NEGATIVE_KEYS.has(column.key);
                const text = formatCell(value, column.format);
                return (
                  <Td
                    key={column.key}
                    numeric={column.numeric}
                    mono={column.key === 'id'}
                    title={value === null ? NA_TITLES[column.key] : undefined}
                    className={cx(
                      negative && 'text-error-strong',
                      column.key === 'name' && 'min-w-40',
                      column.key === 'id' && 'whitespace-nowrap',
                    )}
                  >
                    {column.key === 'id' ? (
                      <span className="inline-flex items-center gap-1">
                        {text}
                        <AnomalyMarker taskId={row.task.id} anomalies={anomalies} />
                      </span>
                    ) : (
                      text
                    )}
                  </Td>
                );
              })}
              <Td>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </Td>
            </Tr>
          );
        })}
      </TBody>
      <tfoot className="border-t-2 border-border-strong bg-card-subtle font-medium">
        <Tr>
          <Td colSpan={2} className="font-mono text-support tracking-wider uppercase">
            Total ({tasks.length} tasks)
          </Td>
          {COLUMNS.slice(2).map((column) => {
            const value = totalRow[column.key] ?? null;
            const negative =
              typeof value === 'number' && value < 0 && NEGATIVE_KEYS.has(column.key);
            return (
              <Td key={column.key} numeric className={cx(negative && 'text-error-strong')}>
                {formatCell(value, column.format)}
              </Td>
            );
          })}
          <Td />
        </Tr>
      </tfoot>
    </Table>
  );
}
