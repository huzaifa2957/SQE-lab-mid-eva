import type { ProjectDocument } from '@evm/core';
import { useMemo } from 'react';
import { CategoryChart } from '../../components/charts/CategoryChart';
import { CostByTaskChart } from '../../components/charts/CostByTaskChart';
import { ChartRenderContext, LIGHT_CHART_PALETTE } from '../../components/charts/palette';
import { SCurveChart } from '../../components/charts/SCurveChart';
import { TrendChart } from '../../components/charts/TrendChart';
import type { ProjectAnalysis } from '../../lib/analysis';
import {
  buildCategoryData,
  buildCostByTaskData,
  buildSCurveData,
  buildTrendData,
} from '../../lib/chartData';
import { type ChartImages, ChartImagesContext } from '../../state/chartImages';

/** Light palette and 2× resolution, whatever the screen theme (FR-40: charts for print). */
const PRINT = { palette: { ...LIGHT_CHART_PALETTE }, devicePixelRatio: 2 };

const noop = () => {};

/**
 * The four dashboard charts rendered off-screen for the PDF, registered in the Report page's
 * own registry. Hidden from assistive technology and not focusable (inert).
 */
export function PrintCharts({
  document,
  analysis,
  registry,
}: {
  document: ProjectDocument;
  analysis: ProjectAnalysis;
  registry: ChartImages;
}) {
  const { project, tasks, snapshots } = document;
  const { metrics, taskMetrics, categories } = analysis;
  const sCurve = useMemo(
    () => buildSCurveData({ project, tasks, snapshots, metrics }),
    [project, tasks, snapshots, metrics],
  );
  const costByTask = useMemo(
    () => buildCostByTaskData(tasks, taskMetrics, 'plan', project.currency),
    [tasks, taskMetrics, project.currency],
  );
  const trend = useMemo(() => buildTrendData(snapshots, metrics.bac), [snapshots, metrics.bac]);
  const category = useMemo(
    () => buildCategoryData(categories, project.currency),
    [categories, project.currency],
  );

  return (
    <div
      aria-hidden="true"
      data-testid="print-charts"
      {...{ inert: '' }}
      className="pointer-events-none fixed top-0 -left-[10000px] w-[720px] bg-white"
    >
      <ChartImagesContext.Provider value={registry}>
        <ChartRenderContext.Provider value={PRINT}>
          <SCurveChart data={sCurve} currency={project.currency} statusDate={project.statusDate} />
          <CostByTaskChart
            data={costByTask}
            currency={project.currency}
            sort="plan"
            onSortChange={noop}
          />
          <TrendChart data={trend} />
          <CategoryChart data={category} currency={project.currency} />
        </ChartRenderContext.Provider>
      </ChartImagesContext.Provider>
    </div>
  );
}
