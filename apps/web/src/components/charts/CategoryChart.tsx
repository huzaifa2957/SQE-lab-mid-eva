import { formatCurrency, formatNumber } from '@evm/core';
import type { Chart, ChartOptions } from 'chart.js';
import { useMemo, useRef } from 'react';
import { Bar } from 'react-chartjs-2';
import type { CategoryData } from '../../lib/chartData';
import { useRegisterChart } from '../../state/chartImages';
import { ChartCard, ChartMessage } from './ChartCard';
import './chartSetup';
import { useChartPalette, useChartPixelRatio } from './palette';

/** FR-23: cost variance (EV − AC) by category; bars right of zero are good, left are over budget. */
export function CategoryChart({ data, currency }: { data: CategoryData; currency: string }) {
  const palette = useChartPalette();
  const pixelRatio = useChartPixelRatio();
  const ref = useRef<Chart<'bar'> | null>(null);
  useRegisterChart('variance-by-category', ref);

  const chartData = useMemo(
    () => ({
      labels: data.labels,
      datasets: [
        {
          label: 'Cost variance (EV − AC)',
          data: data.values,
          backgroundColor: data.values.map((v) => (v < 0 ? palette.error : palette.success)),
          borderColor: data.values.map((v) => (v < 0 ? palette.error : palette.success)),
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    }),
    [data, palette],
  );

  const options = useMemo<ChartOptions<'bar'>>(
    () => ({
      devicePixelRatio: pixelRatio,
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: palette.muted, callback: (value) => formatNumber(Number(value), 0) },
          grid: {
            color: (ctx) => (ctx.tick?.value === 0 ? palette.reference : palette.grid),
            lineWidth: (ctx) => (ctx.tick?.value === 0 ? 1.5 : 0.5),
          },
          border: { display: false },
        },
        y: { ticks: { color: palette.text }, grid: { display: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const value = item.parsed.x;
              if (value === null) return formatCurrency(null, currency);
              return `${formatCurrency(value, currency)} (${value < 0 ? 'over budget' : 'within budget'})`;
            },
          },
        },
      },
    }),
    [pixelRatio, palette, currency],
  );

  return (
    <ChartCard
      title="Cost variance by category"
      description="Earned value minus actual cost, totalled per cost category."
      howToRead="Bars to the right of zero (green) earned more value than they cost. Bars to the left (red) are over budget — the longer the bar, the bigger the overrun."
    >
      {data.labels.length === 0 ? (
        <ChartMessage>Add tasks to see variance by category.</ChartMessage>
      ) : (
        <Bar ref={ref} data={chartData} options={options} role="img" aria-label={data.summary} />
      )}
    </ChartCard>
  );
}
