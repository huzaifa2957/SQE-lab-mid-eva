// POST /api/summary logic, independent of Express so the same code runs on Replit and
// Vercel. Validates the request, calls the model with a timeout and validates the answer.

import { AiSummarySchema, type SummaryRequest, SummaryRequestSchema } from '@evm/core/ai';
import type { Logger } from './logger';

/** Returns the model's raw text (expected to be JSON). */
export type GenerateSummary = (
  request: SummaryRequest,
  signal: AbortSignal,
) => Promise<string | undefined>;

export const SUMMARY_TIMEOUT_MS = 20_000;

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

const TIMED_OUT = Symbol('timed out');

/** Parses the model text as JSON, tolerating a ```json fence. */
function parseJson(text: string): unknown {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(unfenced);
}

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
    const result = await Promise.race([deps.generate(request.data, controller.signal), timeout]);
    if (result === TIMED_OUT) {
      deps.log.error('Gemini call timed out');
      return { status: 504, body: { error: MESSAGES.timeout } };
    }
    text = result;
  } catch (error) {
    deps.log.error('Gemini call failed', error);
    return { status: 502, body: { error: MESSAGES.badGateway } };
  } finally {
    clearTimeout(timer);
  }

  let json: unknown;
  try {
    json = parseJson(text ?? '');
  } catch {
    deps.log.error('Gemini returned text that is not JSON');
    return { status: 502, body: { error: MESSAGES.badGateway } };
  }
  const summary = AiSummarySchema.safeParse(json);
  if (!summary.success) {
    deps.log.error(
      `Gemini response did not match the schema: ${summary.error.issues
        .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
        .join('; ')}`,
    );
    return { status: 502, body: { error: MESSAGES.badGateway } };
  }
  return { status: 200, body: { summary: summary.data, model: deps.model } };
}
