import { Info } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { cx } from './cx';

interface InfoTipProps {
  /** Accessible name of the button, e.g. "How to read this chart". */
  label: string;
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}

/** Small "info" button with a tooltip that opens on hover, focus or click (keyboard reachable). */
export function InfoTip({ label, children, align = 'start', className }: InfoTipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cx('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-text"
      >
        <Info size={15} aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        id={id}
        className={cx(
          'absolute top-full z-20 mt-2 w-72 rounded-lg border border-border bg-card p-3 text-left text-support font-normal tracking-normal text-text normal-case',
          align === 'start' ? 'left-0' : 'right-0',
          open ? 'block' : 'hidden',
        )}
      >
        {children}
      </span>
    </span>
  );
}
