import type { ReactNode } from 'react';
import { cx } from './cx';
import { type Tone, TONES } from './tones';

export type { Tone } from './tones';

interface BadgeProps {
  tone: Tone;
  children: ReactNode;
  title?: string;
  className?: string;
}

/** Status badge: always icon + text, never colour alone. */
export function Badge({ tone, children, title, className }: BadgeProps) {
  const Icon = TONES[tone].icon;
  return (
    <span
      title={title}
      data-tone={tone}
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-support font-medium whitespace-nowrap',
        TONES[tone].className,
        className,
      )}
    >
      <Icon size={13} aria-hidden="true" />
      {children}
    </span>
  );
}
