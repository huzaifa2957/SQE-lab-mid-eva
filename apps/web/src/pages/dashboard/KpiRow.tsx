import {
  type EacMethod,
  formatCurrency,
  formatIndex,
  formatPercent,
  KPI_HIGHER_IS_BETTER,
  type KpiId,
  NA_REASONS,
  type ProjectMetrics,
  trendDirection,
} from '@evm/core';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { kpiBadge } from '../../components/statusLabels';
import { Badge } from '../../components/ui/Badge';
import { cx } from '../../components/ui/cx';
import { MetricCard } from '../../components/ui/MetricCard';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import type { ProjectAnalysis } from '../../lib/analysis';

interface KpiSpec {
  id: KpiId;
  label: string;
  value: (m: ProjectMetrics) => number | null;
  format: 'index' | 'money' | 'percent';
  naReason: string;
}

const KPIS: readonly KpiSpec[] = [
  { id: 'cpi', label: 'CPI', value: (m) => m.cpi, format: 'index', naReason: NA_REASONS.cpi },
  { id: 'spi', label: 'SPI', value: (m) => m.spi, format: 'index', naReason: NA_REASONS.spi },
  {
    id: 'cv',
    label: 'Cost variance (CV)',
    value: (m) => m.cv,
    format: 'money',
    naReason: NA_REASONS.cv,
  },
  {
    id: 'sv',
    label: 'Schedule variance (SV)',
    value: (m) => m.sv,
    format: 'money',
    naReason: NA_REASONS.sv,
  },
  {
    id: 'eac',
    label: 'EAC',
    value: (m) => m.eacPrimary,
    format: 'money',
    naReason: NA_REASONS.eac,
  },
  { id: 'vac', label: 'VAC', value: (m) => m.vac, format: 'money', naReason: NA_REASONS.vac },
  { id: 'tcpi', label: 'TCPI', value: (m) => m.tcpi, format: 'index', naReason: NA_REASONS.tcpi },
  {
    id: 'percentComplete',
    label: '% complete',
    value: (m) => m.percentComplete,
    format: 'percent',
    naReason: NA_REASONS.bacPercent,
  },
];

const EAC_OPTIONS: readonly { value: EacMethod; label: string; title: string }[] = [
  { value: 'typical', label: 'Typical', title: 'BAC ÷ CPI' },
  { value: 'atypical', label: 'Atypical', title: 'AC + (BAC − EV)' },
  { value: 'combined', label: 'Combined', title: 'AC + (BAC − EV) ÷ (CPI × SPI)' },
];

interface KpiRowProps {
  analysis: ProjectAnalysis;
  currency: string;
  eacMethod: EacMethod;
  onEacMethodChange: (method: EacMethod) => void;
}

/** Row 2 (FR-25): KPI cards with §5 status badges and the change since the previous snapshot. */
export function KpiRow({ analysis, currency, eacMethod, onEacMethodChange }: KpiRowProps) {
  const { metrics, statuses, previous } = analysis;
  const format = (spec: KpiSpec, value: number | null) =>
    spec.format === 'index'
      ? formatIndex(value)
      : spec.format === 'money'
        ? formatCurrency(value, currency)
        : formatPercent(value);

  return (
    <section
      aria-label="Key performance indicators"
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4"
    >
      {KPIS.map((spec) => {
        const value = spec.value(metrics);
        const badge = kpiBadge(statuses[spec.id]);
        const before = previous ? spec.value(previous.metrics) : null;
        return (
          <MetricCard
            key={spec.id}
            label={spec.label}
            value={format(spec, value)}
            naReason={spec.naReason}
            badge={
              spec.id === 'percentComplete' ? (
                <Badge tone="neutral">{`${formatPercent(metrics.percentSpent)} spent`}</Badge>
              ) : (
                <Badge tone={badge.tone}>{badge.label}</Badge>
              )
            }
            trend={
              previous && (
                <Trend
                  direction={trendDirection(value, before)}
                  higherIsBetter={KPI_HIGHER_IS_BETTER[spec.id]}
                  previousText={format(spec, before)}
                  previousDate={previous.snapshot.date}
                />
              )
            }
          >
            {spec.id === 'eac' && (
              <SegmentedControl
                label="EAC method"
                value={eacMethod}
                onChange={onEacMethodChange}
                options={EAC_OPTIONS}
              />
            )}
          </MetricCard>
        );
      })}
    </section>
  );
}

function Trend({
  direction,
  higherIsBetter,
  previousText,
  previousDate,
}: {
  direction: ReturnType<typeof trendDirection>;
  higherIsBetter: boolean;
  previousText: string;
  previousDate: string;
}) {
  if (direction === null) return null;
  const better = direction === 'flat' ? null : (direction === 'up') === higherIsBetter;
  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;
  const verdict = better === null ? 'no change' : better ? 'better' : 'worse';
  const description = `${direction === 'flat' ? 'Unchanged' : direction === 'up' ? 'Up' : 'Down'} from ${previousText} on ${previousDate} (${verdict})`;
  return (
    <span
      title={description}
      className={cx(
        'inline-flex items-center gap-0.5 font-mono text-support',
        better === null ? 'text-muted' : better ? 'text-success-strong' : 'text-error-strong',
      )}
    >
      <Icon size={13} aria-hidden="true" />
      <span className="sr-only">{description}</span>
      <span aria-hidden="true">
        {previousText} · {verdict}
      </span>
    </span>
  );
}
