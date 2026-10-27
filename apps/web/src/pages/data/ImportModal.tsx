import {
  isBlank,
  type Project,
  type ProjectInput,
  sanitizeText,
  type StatusSnapshot,
  type Task,
  TASK_COLUMNS,
  type ValidationIssue,
} from '@evm/core';
import { CircleX, FileSpreadsheet, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { FileDropzone } from '../../components/ui/FileDropzone';
import { Modal } from '../../components/ui/Modal';
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { type ParsedImport, readImportFile, validateImport } from '../../lib/importFile';

export interface ImportPayload {
  fileName: string;
  tasks: Task[];
  /** null = the file had no Periods sheet (keep existing snapshots). */
  snapshots: StatusSnapshot[] | null;
  /** null = the file had no Project sheet (keep project details). */
  project: ProjectInput | null;
}

interface ImportModalProps {
  open: boolean;
  project: Project;
  existingTaskCount: number;
  onClose: () => void;
  onImport: (payload: ImportPayload) => void;
}

const PREVIEW_ROWS = 100;
const MAX_MESSAGES = 200;

/** FR-03, FR-05, FR-06: choose a file, preview every error/warning from core, then import. */
export function ImportModal({
  open,
  project,
  existingTaskCount,
  onClose,
  onImport,
}: ImportModalProps) {
  const [reading, setReading] = useState(false);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [fileErrors, setFileErrors] = useState<{
    fileName: string;
    errors: ValidationIssue[];
  } | null>(null);
  const [fraction, setFraction] = useState<boolean | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);

  const reset = () => {
    setParsed(null);
    setFileErrors(null);
    setFraction(undefined);
    setConfirming(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const onFile = async (file: File) => {
    reset();
    setReading(true);
    const result = await readImportFile(file);
    setReading(false);
    if (result.ok) setParsed(result.parsed);
    else setFileErrors({ fileName: file.name, errors: result.errors });
  };

  const validation = useMemo(
    () =>
      parsed
        ? validateImport(parsed, { currentProject: project, percentAsFraction: fraction })
        : null,
    [parsed, project, fraction],
  );

  const doImport = () => {
    if (!parsed || !validation?.canImport) return;
    if (existingTaskCount > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    onImport({
      fileName: parsed.fileName,
      tasks: validation.tasks.tasks,
      snapshots: validation.periods ? validation.periods.snapshots : null,
      project: validation.project?.project ?? null,
    });
    reset();
  };

  const footer = confirming ? (
    <>
      <Button variant="secondary" onClick={() => setConfirming(false)}>
        Back
      </Button>
      <Button variant="primary" onClick={doImport}>
        Replace data
      </Button>
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={close}>
        Cancel
      </Button>
      {(parsed || fileErrors) && (
        <Button variant="secondary" onClick={reset}>
          Choose another file
        </Button>
      )}
      <Button variant="primary" onClick={doImport} disabled={!validation?.canImport}>
        Import
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={close} title="Import tasks" size="xl" footer={footer}>
      {confirming && validation ? (
        <p className="text-body">
          Replace the {existingTaskCount} existing task{existingTaskCount === 1 ? '' : 's'} with{' '}
          {validation.tasks.tasks.length} task{validation.tasks.tasks.length === 1 ? '' : 's'} from{' '}
          <span className="font-mono">{parsed?.fileName}</span>?
          {validation.periods && ' Recorded snapshots will be replaced by the Periods sheet.'}
          {validation.project?.project &&
            ' Project details will be updated from the Project sheet.'}{' '}
          You can undo this straight after.
        </p>
      ) : !parsed && !fileErrors ? (
        <FileDropzone
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          inputLabel="Upload task file"
          title={reading ? 'Reading file…' : 'Drop a .csv or .xlsx file here'}
          hint="Up to 5 MB and 5,000 task rows. Excel files can include Project, Tasks and Periods sheets — download the template from the Data page."
          disabled={reading}
          onFile={(file) => void onFile(file)}
        />
      ) : fileErrors ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={18} aria-hidden="true" className="text-muted" />
            <span className="font-mono text-control">{fileErrors.fileName}</span>
            <Badge tone="error">File rejected</Badge>
          </div>
          <IssueList title="Errors" issues={fileErrors.errors} />
        </div>
      ) : (
        parsed &&
        validation && (
          <Preview
            parsed={parsed}
            validation={validation}
            fraction={fraction}
            onFraction={setFraction}
          />
        )
      )}
    </Modal>
  );
}

function Preview({
  parsed,
  validation,
  fraction,
  onFraction,
}: {
  parsed: ParsedImport;
  validation: NonNullable<ReturnType<typeof validateImport>>;
  fraction: boolean | undefined;
  onFraction: (value: boolean) => void;
}) {
  const { tasks, periods, project } = validation;
  const columns = TASK_COLUMNS.filter((c) => tasks.mapping.columns[c.field] !== undefined);

  const rowTone = new Map<number, 'error' | 'warning'>();
  for (const issue of tasks.warnings)
    if (issue.row !== undefined) rowTone.set(issue.row, 'warning');
  for (const issue of [...parsed.readIssues, ...tasks.errors])
    if (issue.row !== undefined) rowTone.set(issue.row, 'error');

  const rows = (parsed.tasks?.rows ?? [])
    .map((cells, i) => ({ row: i + 2, cells }))
    .filter(({ cells }) => !cells.every(isBlank));

  const errors: [string, ValidationIssue[]][] = [
    ['File', parsed.readIssues],
    ['Tasks', tasks.errors],
    ['Periods sheet', periods?.errors ?? []],
    ['Project sheet', project?.errors ?? []],
  ];
  const warnings: [string, ValidationIssue[]][] = [
    ['Tasks', tasks.warnings.filter((w) => !(w.ruleId === 'VR-07' && fraction === undefined))],
    ['Periods sheet', periods?.warnings ?? []],
    ['Project sheet', project?.warnings ?? []],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <FileSpreadsheet size={18} aria-hidden="true" className="text-muted" />
        <span className="font-mono text-control">{parsed.fileName}</span>
        <Badge tone="neutral">{`${tasks.rowCount} task rows`}</Badge>
        <Badge tone={validation.errorCount > 0 ? 'error' : 'success'}>
          {validation.errorCount > 0
            ? `${validation.errorCount} error${validation.errorCount === 1 ? '' : 's'}`
            : 'No errors'}
        </Badge>
        <Badge tone={validation.warningCount > 0 ? 'warning' : 'neutral'}>
          {`${validation.warningCount} warning${validation.warningCount === 1 ? '' : 's'}`}
        </Badge>
        {periods && <Badge tone="info">{`${periods.snapshots.length} snapshots`}</Badge>}
        {project?.project && <Badge tone="info">{`Project: ${project.project.name}`}</Badge>}
      </div>

      {tasks.percentFractionSuspected && fraction === undefined && (
        <div
          role="group"
          aria-label="Confirm percentages"
          className="rounded-xl border border-warning bg-warning-soft p-5 text-warning-strong"
        >
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert size={16} aria-hidden="true" />
            Are the % Complete values fractions?
          </p>
          <p className="mt-1 text-control">
            Every % Complete value is between 0 and 1. If 0.45 means 45%, convert them; if 0.45
            really means 0.45%, keep them as written.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => onFraction(true)}>
              Yes, convert (0.45 → 45%)
            </Button>
            <Button variant="secondary" onClick={() => onFraction(false)}>
              No, keep as written
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <IssueGroups title="Errors" groups={errors} />
        <IssueGroups title="Warnings" groups={warnings} />
      </div>

      <div className="rounded-xl border border-border">
        <Table aria-label="Import preview">
          <THead>
            <Tr>
              <Th numeric>Row</Th>
              {columns.map((c) => (
                <Th
                  key={c.field}
                  numeric={['budget', 'percentComplete', 'actualCost'].includes(c.field)}
                >
                  {tasks.mapping.headers[c.field] ?? c.label}
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {rows.slice(0, PREVIEW_ROWS).map(({ row, cells }) => (
              <Tr key={row} tone={rowTone.get(row)} data-row={row}>
                <Td numeric className="text-muted">
                  {row}
                </Td>
                {columns.map((c) => {
                  const value = cells[tasks.mapping.columns[c.field]!];
                  const text =
                    value instanceof Date
                      ? value.toISOString().slice(0, 10)
                      : sanitizeText(value, 80).value;
                  const numeric = ['budget', 'percentComplete', 'actualCost'].includes(c.field);
                  return (
                    <Td key={c.field} numeric={numeric} mono={c.field === 'id'}>
                      {text}
                    </Td>
                  );
                })}
              </Tr>
            ))}
          </TBody>
        </Table>
        {rows.length > PREVIEW_ROWS && (
          <p className="border-t border-border px-4 py-3 text-support text-muted">
            Showing the first {PREVIEW_ROWS} of {rows.length} rows. All rows are checked.
          </p>
        )}
      </div>
    </div>
  );
}

function IssueGroups({ title, groups }: { title: string; groups: [string, ValidationIssue[]][] }) {
  const total = groups.reduce((n, [, list]) => n + list.length, 0);
  return (
    <section aria-label={title} className="rounded-xl border border-border p-5">
      <h3 className="font-display text-subsection font-medium">{title}</h3>
      {total === 0 ? (
        <p className="mt-2 text-control text-muted">None.</p>
      ) : (
        groups
          .filter(([, list]) => list.length > 0)
          .map(([label, list]) => <IssueList key={label} title={label} issues={list} />)
      )}
    </section>
  );
}

function IssueList({ title, issues }: { title: string; issues: ValidationIssue[] }) {
  return (
    <div className="mt-3">
      <p className="font-mono text-support tracking-wider text-muted uppercase">{title}</p>
      <ul className="mt-2 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
        {issues.slice(0, MAX_MESSAGES).map((issue, i) => {
          const isError = issue.severity === 'error';
          const Icon = isError ? CircleX : TriangleAlert;
          return (
            <li
              key={`${issue.ruleId}-${i}`}
              className={`flex items-start gap-2 text-control ${isError ? 'text-error-strong' : 'text-warning-strong'}`}
            >
              <Icon size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>
                {issue.message}{' '}
                <span className="font-mono text-support opacity-80">{issue.ruleId}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {issues.length > MAX_MESSAGES && (
        <p className="mt-2 text-support text-muted">…and {issues.length - MAX_MESSAGES} more.</p>
      )}
    </div>
  );
}
