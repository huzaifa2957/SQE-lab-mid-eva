// Calls the model with a timeout and validates its answer (SR-02, SR-08). Shared by the
// AI proxy (apps/ai-proxy) and the desktop main process (apps/desktop, FR-52).

import { type AiSummary, AiSummarySchema, type SummaryRequest } from '@evm/core/ai';

/** Returns the model's raw text (expected to be JSON). */
export type GenerateSummary = (
  request: SummaryRequest,
  signal: AbortSignal,
) => Promise<string | undefined>;

export const SUMMARY_TIMEOUT_MS = 20_000;

export interface SummaryLogger {
  error(message: string, error?: unknown): void;
}

/**
 * - `timeout`: no answer within the timeout (the call is aborted)
 * - `network`: the model could not be reached
 * - `upstream`: the model service returned an error (bad key, quota, unknown model…)
 * - `invalid-output`: the answer was not JSON or failed `AiSummarySchema`
 */
export type SummaryFailure = 'timeout' | 'network' | 'upstream' | 'invalid-output';

export type SummaryOutcome =
  { ok: true; summary: AiSummary } | { ok: false; failure: SummaryFailure };

const TIMED_OUT = Symbol('timed out');

/** Parses the model text as JSON, tolerating a ```json fence. */
export function parseModelJson(text: string): unknown {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(unfenced);
}

/** fetch() failures (offline, DNS, refused) surface as TypeError("fetch failed"). */
function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(error.message))
  );
}

/**
 * Generates a summary for an already validated request. Never throws: every failure is
 * returned as a category, and details go to the log only.
 */
export async function generateSummary(
  request: SummaryRequest,
  deps: { generate: GenerateSummary; log: SummaryLogger; timeoutMs?: number },
): Promise<SummaryOutcome> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(TIMED_OUT);
    }, deps.timeoutMs ?? SUMMARY_TIMEOUT_MS);
  });

  let text: string | undefined;
  try {
    const result = await Promise.race([deps.generate(request, controller.signal), timeout]);
    if (result === TIMED_OUT) {
      deps.log.error('Gemini call timed out');
      return { ok: false, failure: 'timeout' };
    }
    text = result;
  } catch (error) {
    deps.log.error('Gemini call failed', error);
    return { ok: false, failure: isNetworkError(error) ? 'network' : 'upstream' };
  } finally {
    clearTimeout(timer);
  }

  let json: unknown;
  try {
    json = parseModelJson(text ?? '');
  } catch {
    deps.log.error('Gemini returned text that is not JSON');
    return { ok: false, failure: 'invalid-output' };
  }
  const summary = AiSummarySchema.safeParse(json);
  if (!summary.success) {
    deps.log.error(
      `Gemini response did not match the schema: ${summary.error.issues
        .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
        .join('; ')}`,
    );
    return { ok: false, failure: 'invalid-output' };
  }
  return { ok: true, summary: summary.data };
}
