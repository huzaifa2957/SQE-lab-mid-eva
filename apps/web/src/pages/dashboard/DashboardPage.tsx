import type { EacMethod, ProjectDocument } from '@evm/core';
import { Calculator } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryChart } from '../../components/charts/CategoryChart';
import { CostByTaskChart } from '../../components/charts/CostByTaskChart';
import { SCurveChart } from '../../components/charts/SCurveChart';
import { TrendChart } from '../../components/charts/TrendChart';
import { NoProjectState } from '../../components/NoProjectState';
import { RecordStatusButton, StatusDateInput } from '../../components/StatusControls';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAnalysis } from '../../lib/analysis';
import {
  buildCategoryData,
  buildCostByTaskData,
  buildSCurveData,
  buildTrendData,
  type TaskSort,
} from '../../lib/chartData';
import type { Navigate, PageParams } from '../../state/navigation';
import { useProjects } from '../../state/ProjectStore';
import { FormulaHelp } from './FormulaHelp';
import { HealthPanel } from './HealthPanel';
import { KpiRow } from './KpiRow';
import { SnapshotHistory } from './SnapshotHistory';
import { TaskResultsTable } from './TaskResultsTable';

interface DashboardPageProps {
  onNavigate: Navigate;
  params?: PageParams;
}

export function DashboardPage({ onNavigate, params = {} }: DashboardPageProps) {
  const { current } = useProjects();
  if (!current) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Dashboard" />
        <NoProjectState onNavigate={onNavigate} what="the dashboard" />
      </div>
    );
  }
  return <Dashboard document={current} focusTaskId={params.task} />;
}

function Dashboard({ document, focusTaskId }: { document: ProjectDocument; focusTaskId?: string }) {
  const { updateCurrent } = useProjects();
  const analysis = useAnalysis(document);
  const [sort, setSort] = useState<TaskSort>('plan');
  const [helpOpen, setHelpOpen] = useState(false);
  const { project, tasks, snapshots, eacMethod } = document;
  const { metrics, taskMetrics } = analysis;

  const sCurve = useMemo(
    () => buildSCurveData({ project, tasks, snapshots, metrics }),
    [project, tasks, snapshots, metrics],
  );
  const costByTask = useMemo(
    () => buildCostByTaskData(tasks, taskMetrics, sort, project.currency),
    [tasks, taskMetrics, sort, project.currency],
  );
  const trend = useMemo(() => buildTrendData(snapshots, metrics.bac), [snapshots, metrics.bac]);
  const categories = useMemo(
    () => buildCategoryData(analysis.categories, project.currency),
    [analysis.categories, project.currency],
  );

  const setEacMethod = (method: EacMethod) => updateCurrent((d) => ({ ...d, eacMethod: method }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description={`${project.name} · ${tasks.length} tasks · ${snapshots.length} status updates`}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <StatusDateInput document={document} compact className="w-48" />
            <RecordStatusButton document={document} />
          </div>
        }
      />

      <HealthPanel health={analysis.health} headline={analysis.headline} metrics={metrics} />

      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" icon={Calculator} onClick={() => setHelpOpen(true)}>
            How is this calculated?
          </Button>
        </div>
        <KpiRow
          analysis={analysis}
          currency={project.currency}
          eacMethod={eacMethod}
          onEacMethodChange={setEacMethod}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SCurveChart data={sCurve} currency={project.currency} statusDate={project.statusDate} />
        <CostByTaskChart
          data={costByTask}
          currency={project.currency}
          sort={sort}
          onSortChange={setSort}
        />
        <TrendChart data={trend} />
        <CategoryChart data={categories} currency={project.currency} />
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[2fr_1fr]">
        <Card
          flush
          title="Task results"
          description={`All amounts in ${project.currency}. Click a column to sort.`}
        >
          <TaskResultsTable
            tasks={tasks}
            taskMetrics={taskMetrics}
            totals={metrics}
            currency={project.currency}
            focusTaskId={focusTaskId}
            anomaliesByTask={analysis.anomaliesByTask}
          />
        </Card>
        <Card flush title="Snapshot history" description="Cumulative values at each status update.">
          <SnapshotHistory document={document} bac={metrics.bac} />
        </Card>
      </div>

      <FormulaHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
