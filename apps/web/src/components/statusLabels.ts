import type { AnomalySeverity, HealthStatus, InsightStatus } from '@evm/core';
import type { Tone } from './ui/tones';

/** Overall health (FR-27) → badge. */
export function healthBadge(status: HealthStatus | null): { tone: Tone; label: string } {
  switch (status) {
    case 'green':
      return { tone: 'success', label: 'Healthy' };
    case 'amber':
      return { tone: 'warning', label: 'Needs attention' };
    case 'red':
      return { tone: 'error', label: 'At risk' };
    default:
      return { tone: 'neutral', label: 'Not enough data' };
  }
}

/** KPI card status (FR-25) → badge. */
export function kpiBadge(status: HealthStatus | null): { tone: Tone; label: string } {
  switch (status) {
    case 'green':
      return { tone: 'success', label: 'On track' };
    case 'amber':
      return { tone: 'warning', label: 'Watch' };
    case 'red':
      return { tone: 'error', label: 'Action needed' };
    default:
      return { tone: 'neutral', label: 'N/A' };
  }
}

/** Insight status (FR-26) → tone and group heading. */
export const INSIGHT_GROUPS: readonly { status: InsightStatus; tone: Tone; heading: string }[] = [
  { status: 'red', tone: 'error', heading: 'Action needed' },
  { status: 'amber', tone: 'warning', heading: 'Watch' },
  { status: 'info', tone: 'info', heading: 'For information' },
  { status: 'green', tone: 'success', heading: 'Going well' },
];

/** Anomaly severity (FR-31) → badge. */
export const ANOMALY_SEVERITY_BADGE: Readonly<
  Record<AnomalySeverity, { tone: Tone; label: string }>
> = {
  high: { tone: 'error', label: 'High' },
  medium: { tone: 'warning', label: 'Medium' },
  low: { tone: 'info', label: 'Low' },
};
