import {
  type Anomaly,
  buildOfflineSummary,
  buildSummaryRequest,
  type ProjectDocument,
  type ProjectMetrics,
  type StoredSummary,
  summaryFingerprint,
  type TaskMetrics,
} from '@evm/core';
import { RotateCw, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import {
  type AiFailure,
  aiProxyUrl,
  FAILURE_DETAIL,
  FAILURE_REASON,
  requestAiSummary,
} from '../../lib/aiClient';
import { nowIso } from '../../lib/ids';
import { useProjects } from '../../state/ProjectStore';

interface AiSummaryPanelProps {
  document: ProjectDocument;
  metrics: ProjectMetrics;
  taskMetrics: readonly TaskMetrics[];
  anomalies: readonly Anomaly[];
}

type Phase = { name: 'idle' } | { name: 'loading' } | { name: 'failed'; reason: AiFailure };

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * FR-32…FR-35: generates an AI summary through the proxy, with a 20 s timeout, retry and
 * an automatic offline rule-based fallback (FR-34, RL-05). AI text is rendered as plain
 * text only (SR-03). The last summary is stored with the project for the report.
 */
export function AiSummaryPanel({ document, metrics, taskMetrics, anomalies }: AiSummaryPanelProps) {
  const { updateCurrent } = useProjects();
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const pending = useRef<AbortController | null>(null);
  const { project, tasks, snapshots } = document;
  const stored = document.aiSummary;

  const request = useMemo(
    () => buildSummaryRequest({ project, tasks, taskMetrics, metrics, snapshots, anomalies }),
    [project, tasks, taskMetrics, metrics, snapshots, anomalies],
  );
  const fingerprint = useMemo(() => summaryFingerprint(request), [request]);

  // Leaving the page (or switching project) cancels a request in flight.
  useEffect(() => () => pending.current?.abort(), []);

  const generate = async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setPhase({ name: 'loading' });

    const url = aiProxyUrl();
    const result = url
      ? await requestAiSummary(url, request, { signal: controller.signal })
      : ({ ok: false, reason: 'not-configured' } as const);
    if (controller.signal.aborted || pending.current !== controller) return;
    pending.current = null;

    const meta = { generatedAt: nowIso(), fingerprint };
    let summary: StoredSummary;
    if (result.ok) {
      summary = { ...result.summary, ...meta, source: 'ai', model: result.model };
      setPhase({ name: 'idle' });
    } else {
      const offline = buildOfflineSummary(request.metrics, request.insights, request.anomalies, {
        currency: request.currency,
        projectName: request.projectName,
        statusDate: request.statusDate,
        anomalyCounts: request.anomalyCounts,
      });
      summary = { ...offline, ...meta, source: 'offline', reason: FAILURE_REASON[result.reason] };
      setPhase({ name: 'failed', reason: result.reason });
    }
    updateCurrent((d) => ({ ...d, aiSummary: summary }));
  };

  const cancel = () => {
    pending.current?.abort();
    pending.current = null;
    setPhase({ name: 'idle' });
  };

  const loading = phase.name === 'loading';

  return (
    <Card
      title="AI summary"
      description="An executive summary, key risks and three recommendations. Only totals, triggered insights and unusual expenses are sent — never the task table."
      actions={
        <Button
          variant="primary"
          icon={Sparkles}
          onClick={() => void generate()}
          disabled={loading}
        >
          Generate AI summary
        </Button>
      }
      aria-busy={loading}
    >
      {loading && (
        <div role="status" className="flex flex-col gap-4">
          <span className="sr-only">Generating summary…</span>
          <div aria-hidden="true" className="flex flex-col gap-2 motion-safe:animate-pulse">
            {['w-11/12', 'w-full', 'w-10/12', 'w-7/12'].map((width) => (
              <div key={width} className={`h-3 rounded-full bg-card-subtle ${width}`} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-control text-muted">
            Asking the AI service… this can take up to 20 seconds.
            <Button variant="ghost" size="sm" icon={X} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!loading && phase.name === 'failed' && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warning-soft px-4 py-3 text-control text-warning-strong"
        >
          <span>{FAILURE_DETAIL[phase.reason]} A rule-based summary is shown instead.</span>
          <Button variant="secondary" size="sm" icon={RotateCw} onClick={() => void generate()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !stored && phase.name !== 'failed' && (
        <p className="text-body text-muted">
          No summary yet. If the AI service is unavailable, a rule-based summary is written offline
          from the insight rules instead.
        </p>
      )}

      {!loading && stored && (
        <SummaryView summary={stored} outOfDate={stored.fingerprint !== fingerprint} />
      )}
    </Card>
  );
}

function SummaryView({ summary, outOfDate }: { summary: StoredSummary; outOfDate: boolean }) {
  return (
    <article aria-label="Generated summary" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-support text-muted">
        {summary.source === 'ai' ? (
          <Badge tone="info">AI-generated — verify before use</Badge>
        ) : (
          <Badge tone="neutral">Generated offline (rule-based)</Badge>
        )}
        {summary.source === 'offline' && summary.reason && <span>{summary.reason}</span>}
        <span>
          · Generated <time dateTime={summary.generatedAt}>{formatTime(summary.generatedAt)}</time>
        </span>
        {outOfDate && (
          <Badge tone="warning" title="The project data changed after this summary was generated">
            Out of date
          </Badge>
        )}
      </div>
      {outOfDate && (
        <p className="text-control text-muted">
          The project data changed after this summary was generated. Generate it again to update it.
        </p>
      )}

      <section>
        <h3 className="font-mono text-support font-medium tracking-wider text-muted uppercase">
          Executive summary
        </h3>
        <p className="mt-2 max-w-3xl text-body whitespace-pre-line text-text">
          {summary.executiveSummary}
        </p>
      </section>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h3 className="font-mono text-support font-medium tracking-wider text-muted uppercase">
            Key risks
          </h3>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-body text-text">
            {summary.keyRisks.map((risk, i) => (
              <li key={i}>{risk}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="font-mono text-support font-medium tracking-wider text-muted uppercase">
            Recommendations
          </h3>
          <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-body text-text">
            {summary.recommendations.map((recommendation, i) => (
              <li key={i}>{recommendation}</li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}
