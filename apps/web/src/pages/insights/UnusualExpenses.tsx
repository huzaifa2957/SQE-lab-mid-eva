import {
  type Anomaly,
  type AnomalySeverity,
  countAnomaliesBySeverity,
  sortAnomalies,
} from '@evm/core';
import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { ANOMALY_SEVERITY_BADGE as SEVERITY_BADGE } from '../../components/statusLabels';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table';
import type { Navigate } from '../../state/navigation';

const SEVERITIES: readonly AnomalySeverity[] = ['high', 'medium', 'low'];

/** FR-31: anomalies AN-01…AN-06 with reason and severity; task rows link to the Data page. */
export function UnusualExpenses({
  anomalies,
  onNavigate,
}: {
  anomalies: readonly Anomaly[];
  onNavigate: Navigate;
}) {
  const sorted = useMemo(() => sortAnomalies(anomalies), [anomalies]);
  const counts = useMemo(() => countAnomaliesBySeverity(anomalies), [anomalies]);
  const openTask = (taskId: string) => onNavigate('data', { task: taskId });

  return (
    <Card
      flush
      title="Unusual expenses"
      description="Deterministic checks (AN-01…AN-06) on task costs and status history. Click a task row to open it on the Data page."
      actions={
        anomalies.length > 0 && (
          <ul aria-label="Unusual expenses by severity" className="flex flex-wrap gap-2">
            {SEVERITIES.map((severity) => (
              <li key={severity}>
                <Badge tone={SEVERITY_BADGE[severity].tone}>
                  {counts[severity]} {SEVERITY_BADGE[severity].label.toLowerCase()}
                </Badge>
              </li>
            ))}
          </ul>
        )
      }
    >
      {sorted.length === 0 ? (
        <p className="flex items-center gap-3 px-6 pb-6 text-body text-muted">
          <Badge tone="success">All clear</Badge>
          No unusual expenses found
        </p>
      ) : (
        <Table aria-label="Unusual expenses">
          <THead>
            <Tr>
              <Th>Rule</Th>
              <Th>Task / date</Th>
              <Th>Severity</Th>
              <Th>Reason</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </Tr>
          </THead>
          <TBody>
            {sorted.map((anomaly, index) => {
              const { taskId } = anomaly;
              const badge = SEVERITY_BADGE[anomaly.severity];
              return (
                <Tr
                  key={`${anomaly.ruleId}-${taskId ?? ''}-${anomaly.snapshotDate ?? ''}-${index}`}
                  data-rule={anomaly.ruleId}
                  onClick={taskId ? () => openTask(taskId) : undefined}
                  className={taskId ? 'cursor-pointer hover:bg-card-subtle' : undefined}
                >
                  <Td mono className="whitespace-nowrap">
                    {anomaly.ruleId}
                  </Td>
                  <Td mono className="whitespace-nowrap">
                    {taskId ? `Task ${taskId}` : anomaly.snapshotDate}
                    {taskId && anomaly.snapshotDate && (
                      <span className="block text-support text-muted">{anomaly.snapshotDate}</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </Td>
                  <Td className="min-w-64">{anomaly.message}</Td>
                  <Td className="text-right">
                    {taskId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={ArrowRight}
                        iconOnly
                        onClick={(event) => {
                          event.stopPropagation();
                          openTask(taskId);
                        }}
                      >
                        {`Open task ${taskId} on the Data page`}
                      </Button>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
