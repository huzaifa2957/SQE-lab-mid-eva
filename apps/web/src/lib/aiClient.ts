// Client for the AI proxy (FR-32, FR-33, RL-05). Never throws: every failure becomes a
// reason, and the caller falls back to the offline rule-based summary (FR-34).

import { type SummaryRequest, SummaryResponseSchema } from '@evm/core';
import type { AiFailure, AiResult } from '@evm/platform/bridge';

export const AI_TIMEOUT_MS = 20_000;

export type { AiFailure, AiResult } from '@evm/platform/bridge';

/** Short reason stored with an offline summary (FR-34). */
export const FAILURE_REASON: Record<AiFailure, string> = {
  'not-configured': 'AI service not configured',
  timeout: 'AI service timed out',
  'rate-limited': 'AI service busy',
  server: 'AI service unavailable',
  network: 'AI service unavailable',
  invalid: 'AI response could not be used',
  cancelled: 'AI request cancelled',
};

/** Longer explanation shown right after a failed attempt. */
export const FAILURE_DETAIL: Record<AiFailure, string> = {
  'not-configured': 'No AI service is set up for this app.',
  timeout: `The AI service didn't answer within ${AI_TIMEOUT_MS / 1000} seconds.`,
  'rate-limited': 'Too many AI requests were made in the last minute. Wait a minute, then retry.',
  server: 'The AI service is unavailable at the moment.',
  network: "The AI service couldn't be reached. Check your internet connection.",
  invalid: "The AI service's answer wasn't in the expected format.",
  cancelled: 'The request was cancelled.',
};

/** VITE_AI_PROXY_URL (public, baked in at build time), or null when unset/invalid. */
export function aiProxyUrl(): string | null {
  const raw = String(import.meta.env.VITE_AI_PROXY_URL ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const NOT_JSON = Symbol('not json');

export async function requestAiSummary(
  baseUrl: string,
  request: SummaryRequest,
  { signal, timeoutMs = AI_TIMEOUT_MS, fetchImpl = fetch }: RequestOptions = {},
): Promise<AiResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel);
  const fail = (reason: AiFailure): AiResult => ({ ok: false, reason });
  const aborted = () => (timedOut ? fail('timeout') : signal?.aborted ? fail('cancelled') : null);

  try {
    if (signal?.aborted) return fail('cancelled');
    const response = await fetchImpl(`${baseUrl}/api/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (response.status === 429) return fail('rate-limited');
    if (response.status === 504) return fail('timeout');
    if (response.status === 502) return fail('invalid');
    if (!response.ok) return fail('server');
    const json: unknown = await response.json().catch(() => NOT_JSON);
    const stopped = aborted();
    if (stopped) return stopped;
    const parsed = SummaryResponseSchema.safeParse(json);
    if (!parsed.success) return fail('invalid');
    return { ok: true, summary: parsed.data.summary, model: parsed.data.model };
  } catch {
    return aborted() ?? fail('network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
