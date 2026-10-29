import { Info, type LucideIcon } from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { cx } from './cx';

interface InfoTipProps {
  /** Accessible name of the button, e.g. "How to read this chart". */
  label: string;
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
  /** Icon on the button (default: info). */
  icon?: LucideIcon;
  /** Extra classes for the button, e.g. a status colour. */
  buttonClassName?: string;
  /**
   * Position the tooltip relative to the viewport, so it is not clipped by a scrolling
   * container (e.g. inside a table). It closes when the page scrolls.
   */
  floating?: boolean;
}

/** Small "info" button with a tooltip that opens on hover, focus or click (keyboard reachable). */
export function InfoTip({
  label,
  children,
  align = 'start',
  className,
  icon: Icon = Info,
  buttonClassName,
  floating,
}: InfoTipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<CSSProperties>();

  useEffect(() => {
    if (!floating || !open) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPosition({ position: 'fixed', top: rect.bottom + 8, left: rect.left });
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [floating, open]);

  return (
    <span
      className={cx('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={buttonRef}
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
        className={cx(
          'inline-flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-text',
          buttonClassName,
        )}
      >
        <Icon size={15} aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        id={id}
        style={floating ? position : undefined}
        className={cx(
          'z-20 w-72 rounded-lg border border-border bg-card p-3 text-left text-support font-normal tracking-normal text-text normal-case',
          !floating && 'absolute top-full mt-2',
          !floating && (align === 'start' ? 'left-0' : 'right-0'),
          open ? 'block' : 'hidden',
        )}
      >
        {children}
      </span>
    </span>
  );
}
