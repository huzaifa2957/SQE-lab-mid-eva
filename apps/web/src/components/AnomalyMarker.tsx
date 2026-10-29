import type { Anomaly } from '@evm/core';
import { TriangleAlert } from 'lucide-react';
import { InfoTip } from './ui/InfoTip';

/** FR-31: warning icon on a task row, with the anomaly reasons in a tooltip. */
export function AnomalyMarker({
  taskId,
  anomalies,
}: {
  taskId: string;
  anomalies: readonly Anomaly[] | undefined;
}) {
  if (!anomalies || anomalies.length === 0) return null;
  return (
    <InfoTip
      floating
      icon={TriangleAlert}
      label={`Unusual expense on task ${taskId}`}
      buttonClassName="text-warning-strong hover:text-warning-strong"
    >
      <span className="block font-medium">
        {anomalies.length === 1 ? 'Unusual expense' : `${anomalies.length} unusual expenses`}
      </span>
      <ul className="mt-1 flex flex-col gap-1">
        {anomalies.map((anomaly) => (
          <li key={`${anomaly.ruleId}-${anomaly.snapshotDate ?? ''}`}>
            <span className="font-mono text-muted">{anomaly.ruleId}</span> {anomaly.message}
          </li>
        ))}
      </ul>
    </InfoTip>
  );
}
