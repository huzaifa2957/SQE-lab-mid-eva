import {
  classifyVariance,
  computeProjectMetrics,
  computeTaskMetrics,
  formatCurrency,
  formatPercent,
  NA_REASONS,
  type ProjectDocument,
  type Task,
  type ValidationIssue,
} from '@evm/core';
import { Download, FileSpreadsheet, Save, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RecordStatusButton, StatusDateInput } from '../../components/StatusControls';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, FeaturePanel } from '../../components/ui/Card';
import { MetricCard } from '../../components/ui/MetricCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useAnomalies } from '../../lib/analysis';
import { buildTasksTemplateCsv } from '../../lib/csvTemplate';
import { buildTemplateWorkbook, XLSX_MIME } from '../../lib/excel';
import { errorMessage } from '../../lib/files';
import { getPlatform } from '../../platform';
import type { Navigate, PageParams } from '../../state/navigation';
import { useProjects } from '../../state/ProjectStore';
import { useToast } from '../../state/ToastProvider';
import { useProjectFiles } from '../../state/useProjectFiles';
import { ImportModal, type ImportPayload } from './ImportModal';
import { TaskTable } from './TaskTable';

export function DataPage({
  onNavigate,
  params = {},
}: {
  onNavigate: Navigate;
  params?: PageParams;
}) {
  const { current } = useProjects();
  if (!current) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Data" description="Enter tasks, import files and record progress." />
        <FeaturePanel
          eyebrow="No project selected"
          title="Choose or create a project first"
          actions={
            <Button variant="primary" onClick={() => onNavigate('projects')}>
              Go to Projects
            </Button>
          }
        >
          Tasks, imports and snapshots belong to a project.
        </FeaturePanel>
      </div>
    );
  }
  return <DataWorkspace document={current} focusTaskId={params.task} />;
}

function DataWorkspace({
  document,
  focusTaskId,
}: {
  document: ProjectDocument;
  focusTaskId?: string;
}) {
  const { updateCurrent, putDocument } = useProjects();
  const toast = useToast();
  const files = useProjectFiles();
  const { project, tasks, snapshots, eacMethod } = document;

  const [importing, setImporting] = useState(false);

  const taskMetrics = useMemo(
    () => tasks.map((task) => computeTaskMetrics(task, project.statusDate)),
    [tasks, project.statusDate],
  );
  const metrics = useMemo(
    () => computeProjectMetrics(tasks, project.statusDate, eacMethod),
    [tasks, project.statusDate, eacMethod],
  );

  const showWarnings = (warnings: readonly ValidationIssue[]) => {
    if (warnings.length > 0) {
      toast({
        tone: 'warning',
        title: 'Saved with a warning',
        description: warnings.map((w) => w.detail ?? w.message).join(' '),
      });
    }
  };

  const saveTask = (task: Task, index: number | null, warnings: readonly ValidationIssue[]) => {
    updateCurrent((d) => ({
      ...d,
      tasks: index === null ? [...d.tasks, task] : d.tasks.map((t, i) => (i === index ? task : t)),
    }));
    showWarnings(warnings);
  };

  const deleteTask = (index: number) => {
    const before = document;
    const removed = tasks[index]!;
    updateCurrent((d) => ({ ...d, tasks: d.tasks.filter((_, i) => i !== index) }));
    toast({
      tone: 'success',
      title: `Deleted task ${removed.id}`,
      action: { label: 'Undo', onClick: () => putDocument(before) },
    });
  };

  // RL-04: importing replaces data, so keep the previous version for undo.
  const applyImport = (payload: ImportPayload) => {
    const before = document;
    updateCurrent((d) => ({
      ...d,
      project: payload.project ? { ...d.project, ...payload.project } : d.project,
      tasks: payload.tasks,
      snapshots: payload.snapshots ?? d.snapshots,
    }));
    setImporting(false);
    toast({
      tone: 'success',
      title: `Imported ${payload.tasks.length} tasks`,
      description: payload.fileName,
      action:
        before.tasks.length > 0 ? { label: 'Undo', onClick: () => putDocument(before) } : undefined,
    });
  };

  const downloadXlsxTemplate = async () => {
    try {
      await getPlatform().saveFile({
        kind: 'xlsx',
        name: 'template.xlsx',
        data: new Uint8Array(await buildTemplateWorkbook()),
        mimeType: XLSX_MIME,
      });
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Could not create the Excel template',
        description: errorMessage(error),
      });
    }
  };

  const downloadCsvTemplate = async () => {
    try {
      await getPlatform().saveFile({
        kind: 'csv',
        name: 'tasks_template.csv',
        data: buildTasksTemplateCsv(),
        mimeType: 'text/csv',
      });
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Could not create the CSV template',
        description: errorMessage(error),
      });
    }
  };

  const { anomaliesByTask } = useAnomalies(document);

  const varianceStatus = classifyVariance(metrics.variance);
  const money = (value: number | null) => formatCurrency(value, project.currency);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Data"
        description="Edit tasks or import a file. Totals and variances update as you go."
        actions={<RecordStatusButton document={document} />}
      />

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <StatusDateInput document={document} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Upload} onClick={() => setImporting(true)}>
              Import file
            </Button>
            <Button
              variant="secondary"
              icon={FileSpreadsheet}
              onClick={() => void downloadXlsxTemplate()}
            >
              Excel template
            </Button>
            <Button variant="secondary" icon={Download} onClick={() => void downloadCsvTemplate()}>
              CSV template
            </Button>
            <Button variant="secondary" icon={Save} onClick={() => void files.saveFile(document)}>
              Save project file
            </Button>
          </div>
        </div>
      </Card>

      <section aria-label="Totals" className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Estimated cost"
          value={money(metrics.bac)}
          footer={`${tasks.length} tasks`}
        />
        <MetricCard
          label="Actual cost"
          value={money(metrics.ac)}
          footer={`as of ${project.statusDate}`}
        />
        <MetricCard
          label="Variance"
          value={money(metrics.variance)}
          footer={
            varianceStatus === 'unfavourable' ? (
              <Badge tone="error">Over budget</Badge>
            ) : varianceStatus ? (
              <Badge tone="success">Within budget</Badge>
            ) : (
              <Badge tone="neutral">N/A</Badge>
            )
          }
        />
        <MetricCard
          label="% Variance"
          value={formatPercent(metrics.variancePercent)}
          naReason={NA_REASONS.bacPercent}
          footer="Variance ÷ estimated cost"
        />
      </section>

      <Card
        flush
        title="Tasks"
        description="Estimated cost is the task budget. Variance = estimated − actual."
      >
        <TaskTable
          tasks={tasks}
          metrics={taskMetrics}
          project={project}
          onSave={saveTask}
          onDelete={deleteTask}
          anomaliesByTask={anomaliesByTask}
          focusTaskId={focusTaskId}
        />
      </Card>

      <Card
        flush
        title="Recorded snapshots"
        description="Each “Record status” saves cumulative PV, EV and AC for the status date. The Dashboard charts and history use these."
      >
        {snapshots.length === 0 ? (
          <p className="px-6 pb-6 text-control text-muted">No snapshots yet.</p>
        ) : (
          <Table aria-label="Recorded snapshots">
            <THead>
              <Tr>
                <Th>Date</Th>
                <Th numeric>PV</Th>
                <Th numeric>EV</Th>
                <Th numeric>AC</Th>
              </Tr>
            </THead>
            <TBody>
              {[...snapshots].reverse().map((s) => (
                <Tr key={s.date}>
                  <Td mono>{s.date}</Td>
                  <Td numeric>{money(s.pv)}</Td>
                  <Td numeric>{money(s.ev)}</Td>
                  <Td numeric>{money(s.ac)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <ImportModal
        open={importing}
        project={project}
        existingTaskCount={tasks.length}
        onClose={() => setImporting(false)}
        onImport={applyImport}
      />
    </div>
  );
}
