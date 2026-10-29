import { formatCurrency, formatNumber } from '@evm/core';
import type { Chart, ChartOptions } from 'chart.js';
import { useMemo, useRef } from 'react';
import { Bar } from 'react-chartjs-2';
import type { CostByTaskData, TaskSort } from '../../lib/chartData';
import { useRegisterChart } from '../../state/chartImages';
import { SegmentedControl } from '../ui/SegmentedControl';
import { ChartCard, ChartMessage } from './ChartCard';
import './chartSetup';
import { useChartPalette, useChartPixelRatio, withAlpha } from './palette';

interface CostByTaskChartProps {
  data: CostByTaskData;
  currency: string;
  sort: TaskSort;
  onSortChange: (sort: TaskSort) => void;
}

/** FR-21: estimated vs actual cost per task. Estimated = outlined bars, actual = solid bars. */
export function CostByTaskChart({ data, currency, sort, onSortChange }: CostByTaskChartProps) {
  const palette = useChartPalette();
  const pixelRatio = useChartPixelRatio();
  const ref = useRef<Chart<'bar'> | null>(null);
  useRegisterChart('cost-by-task', ref);

  const chartData = useMemo(
    () => ({
      labels: data.ids,
      datasets: [
        {
          label: 'Estimated',
          data: data.estimated,
          backgroundColor: withAlpha(palette.reference, 0.22),
          borderColor: palette.reference,
          borderWidth: 1.5,
          borderRadius: 4,
        },
        {
          label: 'Actual',
          data: data.actual,
          backgroundColor: palette.highlight,
          borderColor: palette.highlight,
          borderWidth: 1.5,
          borderRadius: 4,
        },
      ],
    }),
    [data, palette],
  );

  const options = useMemo<ChartOptions<'bar'>>(
    () => ({
      devicePixelRatio: pixelRatio,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: palette.muted, font: { family: "'IBM Plex Mono', monospace" } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { color: palette.muted, callback: (value) => formatNumber(Number(value), 0) },
          grid: { color: palette.grid, lineWidth: 0.5 },
          border: { display: false },
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: palette.text, usePointStyle: true, pointStyle: 'rectRounded' },
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const i = items[0]?.dataIndex ?? 0;
              return `${data.ids[i]} ${data.names[i] ?? ''}`;
            },
            label: (item) => `${item.dataset.label}: ${formatCurrency(item.parsed.y, currency)}`,
          },
        },
      },
    }),
    [pixelRatio, palette, currency, data.ids, data.names],
  );

  return (
    <ChartCard
      title="Estimated vs actual cost"
      description={
        data.hidden > 0
          ? `Per task — showing ${data.ids.length} of ${data.ids.length + data.hidden}.`
          : 'Budget compared with money spent so far, per task.'
      }
      howToRead="Outlined bars are each task's estimate (budget); solid bars are what it has cost so far. A solid bar taller than its outline is over budget. Sort by biggest overrun to see the worst tasks first."
      actions={
        <SegmentedControl
          label="Sort tasks"
          value={sort}
          onChange={onSortChange}
          options={[
            { value: 'plan', label: 'Plan order' },
            { value: 'overrun', label: 'Biggest overrun' },
          ]}
        />
      }
    >
      {data.ids.length === 0 ? (
        <ChartMessage>Add tasks to compare estimated and actual cost.</ChartMessage>
      ) : (
        <Bar ref={ref} data={chartData} options={options} role="img" aria-label={data.summary} />
      )}
    </ChartCard>
  );
}
