import { METRIC_DEFINITIONS } from '@evm/core';
import { Modal } from '../../components/ui/Modal';

/** FR-16: slide-out panel listing every metric, its formula and what it means. */
export function FormulaHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="right"
      title="How is this calculated?"
      description="Every figure comes from these formulas, as of the status date."
    >
      <dl className="flex flex-col divide-y divide-border">
        {METRIC_DEFINITIONS.map((d) => (
          <div key={d.id} className="py-4 first:pt-0">
            <dt className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-text">{d.name}</span>
              <span className="font-mono text-support text-muted">{d.abbreviation}</span>
            </dt>
            <dd className="mt-1.5">
              <code className="block rounded-md bg-card-subtle px-2.5 py-1.5 font-mono text-control text-text">
                {d.formula}
              </code>
              <p className="mt-1.5 text-control text-muted">{d.meaning}</p>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-support text-muted">
        PV spreads each task’s budget evenly across its planned dates. Values that cannot be
        calculated (for example CPI when nothing has been spent) are shown as “N/A”.
      </p>
    </Modal>
  );
}
