import {
  CircleCheck,
  CircleMinus,
  CircleX,
  Info,
  type LucideIcon,
  TriangleAlert,
} from 'lucide-react';

export type Tone = 'success' | 'warning' | 'error' | 'neutral' | 'info';

export const TONES: Record<Tone, { className: string; icon: LucideIcon }> = {
  success: { className: 'bg-success-soft text-success-strong', icon: CircleCheck },
  warning: { className: 'bg-warning-soft text-warning-strong', icon: TriangleAlert },
  error: { className: 'bg-error-soft text-error-strong', icon: CircleX },
  neutral: { className: 'bg-card-subtle text-muted border border-border', icon: CircleMinus },
  info: { className: 'bg-card-subtle text-text border border-border', icon: Info },
};

export function toneIcon(tone: Tone): LucideIcon {
  return TONES[tone].icon;
}
