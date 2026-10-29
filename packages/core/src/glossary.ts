// Metric definitions for the formula help panel (FR-16) and the report's formula appendix (FR-40).

import type { KpiId } from './insights';

export interface MetricDefinition {
  id: string;
  name: string;
  abbreviation: string;
  formula: string;
  meaning: string;
}

export const METRIC_DEFINITIONS: readonly MetricDefinition[] = Object.freeze([
  {
    id: 'bac',
    name: 'Budget at completion',
    abbreviation: 'BAC',
    formula: 'Σ task budgets',
    meaning: 'The total approved budget for all the work.',
  },
  {
    id: 'pv',
    name: 'Planned value',
    abbreviation: 'PV',
    formula: 'budget × share of planned duration elapsed by the status date',
    meaning: 'How much work, in money, should have been done by now according to the plan.',
  },
  {
    id: 'ev',
    name: 'Earned value',
    abbreviation: 'EV',
    formula: 'budget × % complete ÷ 100',
    meaning: 'The budgeted value of the work actually done.',
  },
  {
    id: 'ac',
    name: 'Actual cost',
    abbreviation: 'AC',
    formula: 'Σ actual cost to the status date',
    meaning: 'What the work done so far has actually cost.',
  },
  {
    id: 'variance',
    name: 'Cost variance (simple)',
    abbreviation: 'Variance',
    formula: 'estimated cost − actual cost',
    meaning: 'Budget left over (positive) or overspent (negative), ignoring progress.',
  },
  {
    id: 'cv',
    name: 'Cost variance',
    abbreviation: 'CV',
    formula: 'EV − AC',
    meaning: 'Positive: the work done cost less than its value. Negative: it cost more.',
  },
  {
    id: 'sv',
    name: 'Schedule variance',
    abbreviation: 'SV',
    formula: 'EV − PV',
    meaning: 'Positive: ahead of plan. Negative: behind plan (in money terms).',
  },
  {
    id: 'cvPercent',
    name: 'Cost variance %',
    abbreviation: 'CV%',
    formula: 'CV ÷ EV × 100',
    meaning: 'Cost variance as a share of the value earned.',
  },
  {
    id: 'svPercent',
    name: 'Schedule variance %',
    abbreviation: 'SV%',
    formula: 'SV ÷ PV × 100',
    meaning: 'Schedule variance as a share of the planned work.',
  },
  {
    id: 'cpi',
    name: 'Cost performance index',
    abbreviation: 'CPI',
    formula: 'EV ÷ AC',
    meaning: 'Value earned per 1 unit spent. Above 1.00 is under budget; below 1.00 is over.',
  },
  {
    id: 'spi',
    name: 'Schedule performance index',
    abbreviation: 'SPI',
    formula: 'EV ÷ PV',
    meaning: 'Share of the planned work that is done. Above 1.00 is ahead; below 1.00 is behind.',
  },
  {
    id: 'eacTypical',
    name: 'Estimate at completion (typical)',
    abbreviation: 'EAC',
    formula: 'BAC ÷ CPI',
    meaning: 'Forecast final cost if the current cost efficiency continues.',
  },
  {
    id: 'eacAtypical',
    name: 'Estimate at completion (atypical)',
    abbreviation: 'EAC',
    formula: 'AC + (BAC − EV)',
    meaning: 'Forecast final cost if the overrun so far was a one-off and the rest goes to plan.',
  },
  {
    id: 'eacCombined',
    name: 'Estimate at completion (combined)',
    abbreviation: 'EAC',
    formula: 'AC + (BAC − EV) ÷ (CPI × SPI)',
    meaning: 'Forecast final cost when both cost and schedule performance affect the rest.',
  },
  {
    id: 'etc',
    name: 'Estimate to complete',
    abbreviation: 'ETC',
    formula: 'EAC − AC',
    meaning: 'How much more the remaining work is expected to cost.',
  },
  {
    id: 'vac',
    name: 'Variance at completion',
    abbreviation: 'VAC',
    formula: 'BAC − EAC',
    meaning: 'Expected saving (positive) or overrun (negative) at the end.',
  },
  {
    id: 'vacPercent',
    name: 'Variance at completion %',
    abbreviation: 'VAC%',
    formula: 'VAC ÷ BAC × 100',
    meaning: 'Expected saving or overrun as a share of the budget.',
  },
  {
    id: 'tcpi',
    name: 'To-complete performance index',
    abbreviation: 'TCPI',
    formula: '(BAC − EV) ÷ (BAC − AC)',
    meaning:
      'Cost efficiency the remaining work needs to finish on budget. Above 1.10 is unrealistic.',
  },
  {
    id: 'percentComplete',
    name: 'Percent complete',
    abbreviation: '% complete',
    formula: 'EV ÷ BAC × 100',
    meaning: 'Share of the total work that is done.',
  },
  {
    id: 'percentSpent',
    name: 'Percent spent',
    abbreviation: '% spent',
    formula: 'AC ÷ BAC × 100',
    meaning: 'Share of the total budget that has been spent.',
  },
]);

/** Whether an increase in the KPI is an improvement (used for trend arrows). */
export const KPI_HIGHER_IS_BETTER: Readonly<Record<KpiId, boolean>> = Object.freeze({
  cpi: true,
  spi: true,
  cv: true,
  sv: true,
  eac: false,
  vac: true,
  tcpi: false,
  percentComplete: true,
});
