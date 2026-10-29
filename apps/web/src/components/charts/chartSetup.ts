// Chart.js registration and the two small plugins used by the dashboard charts.
// Plugins are local (no extra dependency) and only draw on the canvas.

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  type ChartType,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  type Plugin,
  PointElement,
  Tooltip,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
);
ChartJS.defaults.font.family = "'DM Sans', ui-sans-serif, system-ui, sans-serif";
ChartJS.defaults.font.size = 12;
ChartJS.defaults.animation = false; // instant live updates (FR-24) and stable PNG export

export interface StatusLineOptions {
  /** x value (day number) of the status date; omitted = not drawn. */
  x?: number;
  color: string;
  label: string;
}

/** FR-20: vertical line marking the status date. */
export const statusLinePlugin: Plugin<ChartType, StatusLineOptions> = {
  id: 'statusLine',
  afterDatasetsDraw(chart, _args, options) {
    if (options.x === undefined) return;
    const scale = chart.scales.x;
    if (!scale) return;
    const x = scale.getPixelForValue(options.x);
    const { top, bottom, left, right } = chart.chartArea;
    if (x < left || x > right) return;
    const { ctx } = chart;
    ctx.save();
    ctx.strokeStyle = options.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = options.color;
    ctx.font = `500 11px ${ChartJS.defaults.font.family}`;
    ctx.textAlign = x > (left + right) / 2 ? 'right' : 'left';
    ctx.fillText(options.label, x + (ctx.textAlign === 'right' ? -6 : 6), top + 12);
    ctx.restore();
  },
};

export interface HealthyZoneOptions {
  /** y value from which the zone starts (1.0 for CPI/SPI); omitted = not drawn. */
  from?: number;
  color: string;
}

/** FR-22: soft shaded "healthy zone" at or above the reference value. */
export const healthyZonePlugin: Plugin<ChartType, HealthyZoneOptions> = {
  id: 'healthyZone',
  beforeDatasetsDraw(chart, _args, options) {
    if (options.from === undefined) return;
    const scale = chart.scales.y;
    if (!scale) return;
    const { top, bottom, left, right } = chart.chartArea;
    const y = Math.max(top, Math.min(bottom, scale.getPixelForValue(options.from)));
    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = options.color;
    ctx.fillRect(left, top, right - left, y - top);
    ctx.restore();
  },
};

declare module 'chart.js' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- must match Chart.js's declaration
  interface PluginOptionsByType<TType extends ChartType> {
    statusLine?: Partial<StatusLineOptions>;
    healthyZone?: Partial<HealthyZoneOptions>;
  }
}

export { ChartJS };
