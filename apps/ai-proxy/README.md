# apps/ai-proxy

Small server that holds the Gemini API key and returns AI summaries for the web app
(FR-32, SR-01, SR-02, SR-08). Setup and the free API key are explained in the
[root README](../../README.md#ai-summary-optional).

## Endpoints

| Method | Path           | Response                                                              |
| ------ | -------------- | --------------------------------------------------------------------- |
| GET    | `/api/health`  | `{ "status": "ok" }` — reveals no configuration                       |
| POST   | `/api/summary` | `{ summary: { executiveSummary, keyRisks, recommendations }, model }` |

Errors are always `{ "error": "<generic message>" }`; details go to the server log only.

| Status | When                                                                 |
| ------ | -------------------------------------------------------------------- |
| 400    | Body is not JSON or fails the Zod schema (`SummaryRequestSchema`)    |
| 403    | `Origin` header missing or not in `ALLOWED_ORIGINS`                  |
| 413    | Body larger than 20 KB                                               |
| 429    | More than 10 requests per minute from one IP                         |
| 502    | Gemini error, or an answer that is not valid JSON / fails the schema |
| 504    | Gemini did not answer within 20 seconds                              |

The web app treats every non-200 answer (and network errors) as "use the offline summary".

## Security controls

- **SR-01** Key only in env vars (`.env`, Replit Secrets, Vercel env); redacted from logs; never
  sent to clients (tested in `tests/app.test.ts`, PT-14).
- **SR-02** Helmet headers, CORS allow-list + origin check, 20 KB body limit, Zod validation,
  `express-rate-limit` (10/min/IP), 20 s timeout with abort, generic error messages.
- **SR-08** `src/prompts.ts`: a fixed system instruction to treat the data as data; only
  aggregated metrics, insights and anomalies are sent as JSON (task names truncated to 60
  characters; `<` escaped so text cannot close the data block); a JSON response schema; the
  answer is validated with `AiSummarySchema` before it is returned.

## Files

| File             | Purpose                                                       |
| ---------------- | ------------------------------------------------------------- |
| `src/config.ts`  | Reads and validates env vars; clear startup errors            |
| `src/prompts.ts` | System instruction, user prompt, response JSON schema         |
| `src/gemini.ts`  | `@google/genai` call                                          |
| `src/handler.ts` | Framework-free request handling (validation, timeout, output) |
| `src/app.ts`     | Express app with the SR-02 middleware                         |
| `src/server.ts`  | Local / Replit entry (`npm run dev` / `npm run start`)        |
| `api/*.ts`       | Vercel serverless functions using the same app                |

## Vercel notes

Set the Vercel project root to `apps/ai-proxy` and enable "Include files outside the root
directory" so `packages/core` is bundled. The rate limit is kept in memory, so on serverless it
applies per function instance rather than globally — Gemini's own quota is the backstop.
