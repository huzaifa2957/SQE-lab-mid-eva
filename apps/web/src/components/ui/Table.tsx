import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cx } from './cx';

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cx('w-full border-collapse text-control', className)} {...rest} />
    </div>
  );
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="bg-card-subtle" {...props} />;
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Tints the row for import previews and anomalies. */
  tone?: 'error' | 'warning';
}

export function Tr({ tone, className, ...rest }: TrProps) {
  return (
    <tr
      data-tone={tone}
      className={cx(
        'border-b border-border last:border-b-0',
        tone === 'error' && 'bg-error-soft',
        tone === 'warning' && 'bg-warning-soft',
        className,
      )}
      {...rest}
    />
  );
}

interface CellProps {
  /** Right-aligned mono figures. */
  numeric?: boolean;
  /** Mono font, e.g. task IDs. */
  mono?: boolean;
}

export function Th({
  numeric,
  mono,
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <th
      scope="col"
      className={cx(
        'border-b border-border px-4 py-2.5 font-mono text-support font-medium tracking-wider whitespace-nowrap text-muted uppercase',
        numeric ? 'text-right' : 'text-left',
        mono && 'font-mono',
        className,
      )}
      {...rest}
    />
  );
}

export function Td({
  numeric,
  mono,
  className,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & CellProps) {
  return (
    <td
      className={cx(
        'px-4 py-3 align-top text-text',
        numeric && 'text-right font-mono tabular-nums whitespace-nowrap',
        mono && 'font-mono',
        className,
      )}
      {...rest}
    />
  );
}
