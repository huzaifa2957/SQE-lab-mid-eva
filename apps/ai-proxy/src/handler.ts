// POST /api/summary logic, independent of Express so the same code runs on Replit and
// Vercel. Validates the request; the shared @evm/platform/ai code calls the model with a
// timeout and validates the answer.

import { SummaryRequestSchema } from '@evm/core/ai';
import { type GenerateSummary, generateSummary, type SummaryFailure } from '@evm/platform/ai';
import type { Logger } from './logger';

export type { GenerateSummary } from '@evm/platform/ai';
export { SUMMARY_TIMEOUT_MS } from '@evm/platform/ai';

/** Generic messages sent to the client (SR-02). Details stay in the server log. */
export const MESSAGES = Object.freeze({
  invalidRequest: 'The request was not valid.',
  tooLarge: 'The request is too large.',
  forbidden: 'This site is not allowed to use the AI service.',
  rateLimited: 'Too many AI summary requests. Please wait a minute and try again.',
  timeout: 'The AI service took too long to answer.',
  badGateway: 'The AI service could not produce a summary.',
  internal: 'Something went wrong. Please try again later.',
  notFound: 'Not found.',
});

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export interface HandlerDeps {
  generate: GenerateSummary;
  model: string;
  log: Logger;
  timeoutMs?: number;
}

const STATUS: Record<SummaryFailure, { status: number; error: string }> = {
  timeout: { status: 504, error: MESSAGES.timeout },
  network: { status: 502, error: MESSAGES.badGateway },
  upstream: { status: 502, error: MESSAGES.badGateway },
  'invalid-output': { status: 502, error: MESSAGES.badGateway },
};

export async function handleSummary(body: unknown, deps: HandlerDeps): Promise<HandlerResult> {
  const request = SummaryRequestSchema.safeParse(body);
  if (!request.success) {
    deps.log.info(
      `Rejected invalid request: ${request.error.issues
        .slice(0, 5)
        .map((i) => i.path.join('.') || '(body)')
        .join(', ')}`,
    );
    return { status: 400, body: { error: MESSAGES.invalidRequest } };
  }
  const outcome = await generateSummary(request.data, deps);
  if (!outcome.ok) {
    const { status, error } = STATUS[outcome.failure];
    return { status, body: { error } };
  }
  return { status: 200, body: { summary: outcome.summary, model: deps.model } };
}
