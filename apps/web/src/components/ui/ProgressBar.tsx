import { cx } from './cx';

interface ProgressBarProps {
  label: string;
  /** Percent (0–100+); null shows an empty bar. */
  value: number | null;
  /** Formatted value shown next to the label, e.g. "47.69%". */
  display: string;
  tone?: 'accent' | 'muted';
  /** Light text for use on the forest-green feature panel. */
  onFeature?: boolean;
}

export function ProgressBar({
  label,
  value,
  display,
  tone = 'accent',
  onFeature,
}: ProgressBarProps) {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cx(
          'flex items-baseline justify-between text-control',
          onFeature ? 'text-feature-text' : 'text-text',
        )}
      >
        <span>{label}</span>
        <span className="font-mono tabular-nums">{display}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value === null ? undefined : Math.round(width)}
        aria-valuetext={display}
        className={cx(
          'h-2.5 overflow-hidden rounded-full',
          onFeature ? 'bg-feature-muted/30' : 'bg-card-subtle',
        )}
      >
        <div
          className={cx(
            'h-full rounded-full',
            tone === 'accent' ? 'bg-accent' : onFeature ? 'bg-feature-muted' : 'bg-muted',
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
