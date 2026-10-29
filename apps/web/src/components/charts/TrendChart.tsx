import { formatIndex } from '@evm/core';
import type { Chart, ChartOptions } from 'chart.js';
import { useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import type { TrendData } from '../../lib/chartData';
import { useRegisterChart } from '../../state/chartImages';
import { ChartCard, ChartMessage } from './ChartCard';
import { healthyZonePlugin } from './chartSetup';
import { useChartPalette, useChartPixelRatio, withAlpha } from './palette';

/** FR-22: CPI and SPI over snapshots, with a 1.0 reference line and a healthy zone ≥ 1.0. */
export function TrendChart({ data }: { data: TrendData }) {
  const palette = useChartPalette();
  const pixelRatio = useChartPixelRatio();
  const ref = useRef<Chart<'line'> | null>(null);
  useRegisterChart('cpi-spi-trend', ref);

  const chartData = useMemo(
    () => ({
      labels: data.labels,
      datasets: [
        {
          label: 'CPI',
          data: data.cpi,
          borderColor: palette.highlight,
          backgroundColor: palette.highlight,
          borderWidth: 2.5,
          pointRadius: 4,
          pointStyle: 'circle' as const,
          spanGaps: true,
        },
        {
          label: 'SPI',
          data: data.spi,
          borderColor: palette.success,
          backgroundColor: palette.success,
          borderWidth: 2.5,
          borderDash: [6, 4],
          pointRadius: 4,
          pointStyle: 'rectRot' as const,
          spanGaps: true,
        },
        {
          label: 'Target 1.00',
          data: data.labels.map(() => 1),
          borderColor: palette.reference,
          backgroundColor: palette.reference,
          borderWidth: 1.5,
          borderDash: [2, 3],
          pointRadius: 0,
          pointStyle: 'line' as const,
        },
      ],
    }),
    [data, palette],
  );

  const options = useMemo<ChartOptions<'line'>>(
    () => ({
      devicePixelRatio: pixelRatio,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          ticks: {
            color: palette.muted,
            maxTicksLimit: 8,
            font: { family: "'IBM Plex Mono', monospace" },
          },
          grid: { display: false },
        },
        y: {
          suggestedMin: 0.7,
          suggestedMax: 1.2,
          ticks: { color: palette.muted, callback: (value) => formatIndex(Number(value)) },
          grid: { color: palette.grid, lineWidth: 0.5 },
          border: { display: false },
        },
      },
      plugins: {
        legend: { position: 'bottom', labels: { color: palette.text, usePointStyle: true } },
        tooltip: {
          callbacks: { label: (item) => `${item.dataset.label}: ${formatIndex(item.parsed.y)}` },
        },
        healthyZone: { from: 1, color: withAlpha(palette.success, 0.1) },
      },
    }),
    [pixelRatio, palette],
  );

  return (
    <ChartCard
      title="CPI and SPI trend"
      description="Cost and schedule efficiency at each recorded status update."
      howToRead="The shaded band at the top is the healthy zone (1.00 or better). CPI (solid line, circles) below 1.00 means over budget; SPI (dashed line, diamonds) below 1.00 means behind schedule. Watch the direction as much as the level."
    >
      {data.enough ? (
        <Line
          ref={ref}
          data={chartData}
          options={options}
          plugins={[healthyZonePlugin]}
          role="img"
          aria-label={data.summary}
        />
      ) : (
        <ChartMessage>Record at least two status updates to see trends</ChartMessage>
      )}
    </ChartCard>
  );
}
