import { formatCurrency, formatNumber } from '@evm/core';
import type { Chart, ChartOptions } from 'chart.js';
import { useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import { dayLabel, type SCurveData } from '../../lib/chartData';
import { useRegisterChart } from '../../state/chartImages';
import { ChartCard } from './ChartCard';
import { statusLinePlugin } from './chartSetup';
import { useChartPalette } from './palette';

interface SCurveChartProps {
  data: SCurveData;
  currency: string;
  statusDate: string;
}

/** FR-20: cumulative PV (baseline), EV and AC, BAC line, EAC projection and status date. */
export function SCurveChart({ data, currency, statusDate }: SCurveChartProps) {
  const palette = useChartPalette();
  const ref = useRef<Chart<'line'> | null>(null);
  useRegisterChart('s-curve', ref);

  const chartData = useMemo(
    () => ({
      datasets: [
        {
          label: 'Planned value (PV)',
          data: data.pv,
          borderColor: palette.muted,
          backgroundColor: palette.muted,
          borderWidth: 2,
          borderDash: [2, 3],
          pointRadius: 0,
          pointHoverRadius: 3,
          pointStyle: 'line' as const,
        },
        {
          label: 'Earned value (EV)',
          data: data.ev,
          borderColor: palette.success,
          backgroundColor: palette.success,
          borderWidth: 2.5,
          pointRadius: 4,
          pointStyle: 'rectRot' as const,
        },
        {
          label: 'Actual cost (AC)',
          data: data.ac,
          borderColor: palette.error,
          backgroundColor: palette.error,
          borderWidth: 2.5,
          pointRadius: 4,
          pointStyle: 'triangle' as const,
        },
        {
          label: 'Budget (BAC)',
          data: data.bac,
          borderColor: palette.reference,
          backgroundColor: palette.reference,
          borderWidth: 1.5,
          borderDash: [8, 5],
          pointRadius: 0,
          pointStyle: 'line' as const,
        },
        {
          label: 'Forecast (EAC)',
          data: data.eac,
          borderColor: palette.highlight,
          backgroundColor: palette.highlight,
          borderWidth: 2,
          borderDash: [4, 4],
          pointRadius: [0, 4],
          pointStyle: 'star' as const,
        },
      ],
    }),
    [data, palette],
  );

  const options = useMemo<ChartOptions<'line'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            color: palette.muted,
            maxTicksLimit: 7,
            callback: (value) => dayLabel(Number(value)),
          },
          grid: { color: palette.grid, lineWidth: 0.5 },
          border: { color: palette.grid },
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
          labels: { color: palette.text, usePointStyle: true, boxHeight: 8 },
        },
        tooltip: {
          callbacks: {
            title: (items) => (items[0] ? dayLabel(items[0].parsed.x ?? 0) : ''),
            label: (item) => `${item.dataset.label}: ${formatCurrency(item.parsed.y, currency)}`,
          },
        },
        statusLine: {
          x: data.statusDay ?? undefined,
          color: palette.text,
          label: `Status ${statusDate}`,
        },
      },
    }),
    [palette, currency, data.statusDay, statusDate],
  );

  return (
    <ChartCard
      title="S-curve"
      description="Cumulative planned value, earned value and actual cost over time."
      howToRead={
        <>
          The dotted line is the plan (PV). EV (diamonds) below PV means behind schedule; AC
          (triangles) above EV means over budget. The dashed line from the status date shows where
          the forecast cost (EAC) ends up against the budget (BAC).
        </>
      }
    >
      <Line
        ref={ref}
        data={chartData}
        options={options}
        plugins={[statusLinePlugin]}
        role="img"
        aria-label={data.summary}
      />
    </ChartCard>
  );
}
