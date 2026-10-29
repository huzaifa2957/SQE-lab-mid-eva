import {
  formatIndex,
  formatNumber,
  type HealthStatus,
  kpiStatuses,
  type ProjectDocument,
  removeSnapshot,
  snapshotMetrics,
} from '@evm/core';
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Modal';
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import { useProjects } from '../../state/ProjectStore';
import { useToast } from '../../state/ToastProvider';

/** Index cells below target (core §5 status amber/red) are shown in muted red. */
const offTarget = (status: HealthStatus | null) =>
  status === 'amber' || status === 'red' ? 'text-error-strong' : undefined;

/** FR-17: snapshot history with CPI/SPI, newest first; delete needs confirmation. */
export function SnapshotHistory({
  document,
  bac,
}: {
  document: ProjectDocument;
  bac: number | null;
}) {
  const { updateCurrent, putDocument } = useProjects();
  const toast = useToast();
  const [toDelete, setToDelete] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      [...document.snapshots]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((snapshot) => {
          const metrics = snapshotMetrics(snapshot, bac, document.eacMethod);
          return { snapshot, metrics, statuses: kpiStatuses(metrics) };
        }),
    [document.snapshots, document.eacMethod, bac],
  );

  const confirmDelete = () => {
    if (!toDelete) return;
    const before = document;
    const date = toDelete;
    updateCurrent((d) => ({ ...d, snapshots: removeSnapshot(d.snapshots, date) }));
    setToDelete(null);
    toast({
      tone: 'success',
      title: `Deleted snapshot ${date}`,
      action: { label: 'Undo', onClick: () => putDocument(before) },
    });
  };

  if (rows.length === 0) {
    return (
      <p className="px-6 pb-6 text-control text-muted">
        No snapshots yet. Use “Record status” to save one.
      </p>
    );
  }

  return (
    <>
      <Table aria-label="Snapshot history">
        <THead>
          <Tr>
            <Th>Date</Th>
            <Th numeric>PV</Th>
            <Th numeric>EV</Th>
            <Th numeric>AC</Th>
            <Th numeric>CPI</Th>
            <Th numeric>SPI</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </Tr>
        </THead>
        <TBody>
          {rows.map(({ snapshot, metrics, statuses }) => (
            <Tr key={snapshot.date}>
              <Td mono>{snapshot.date}</Td>
              <Td numeric>{formatNumber(snapshot.pv)}</Td>
              <Td numeric>{formatNumber(snapshot.ev)}</Td>
              <Td numeric>{formatNumber(snapshot.ac)}</Td>
              <Td numeric className={offTarget(statuses.cpi)}>
                {formatIndex(metrics.cpi)}
              </Td>
              <Td numeric className={offTarget(statuses.spi)}>
                {formatIndex(metrics.spi)}
              </Td>
              <Td>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    iconOnly
                    onClick={() => setToDelete(snapshot.date)}
                  >
                    {`Delete snapshot ${snapshot.date}`}
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <ConfirmDialog
        open={toDelete !== null}
        title="Delete snapshot?"
        tone="danger"
        confirmLabel="Delete snapshot"
        message={`The status update for ${toDelete} will be removed from the history and the trend charts.`}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
