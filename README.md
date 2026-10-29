# EVM Cost Tracker

Earned Value Management cost-control tool: a static web app and an Electron desktop app sharing one tested calculation core. See [PROJECT_PLAN.md](PROJECT_PLAN.md) for requirements and phases.

## Structure

```
packages/core   pure TS: formulas, validation, insights, anomalies
apps/web        React + Vite + Tailwind (static build)
apps/desktop    Electron shell (Phase 7)
apps/ai-proxy   Gemini proxy: Express server + Vercel functions
samples/        templates and test files
docs/           SRS, test plan, traceability
```

## Getting started

Requires Node.js 20.19+.

```sh
npm install
npm run dev -w apps/web     # http://localhost:5173
```

To try the production build (with the Content-Security-Policy applied):

```sh
npm run build -w apps/web
npm run preview -w apps/web # http://localhost:4173
```

Data is stored in the browser (IndexedDB). Use **Save project file** to keep a portable
`.evm.json` copy. UI rules are in [docs/design-system.md](docs/design-system.md).

## Scripts

| Command                        | What it does                                                         |
| ------------------------------ | -------------------------------------------------------------------- |
| `npm run lint`                 | ESLint (zero warnings allowed)                                       |
| `npm run format:check`         | Prettier check                                                       |
| `npm run typecheck`            | `tsc` in every workspace                                             |
| `npm run test`                 | Vitest across core, web and ai-proxy                                 |
| `npm run test:coverage`        | Tests with V8 coverage (NF-04)                                       |
| `npm run build -w apps/web`    | Production web build to `apps/web/dist`                              |
| `npm run sample-reports`       | Rebuild and regenerate `docs/sample-reports/` (needs Edge or Chrome) |
| `npm run dev -w apps/ai-proxy` | AI proxy on http://localhost:3001 (reloads on change)                |

## Configuration

- `.env.example` → copy to `.env` at the repo root: AI proxy settings (server-side only).
- `apps/web/.env.example` → copy to `apps/web/.env.local`: the web app's public settings.

API keys never go in client code or Git (SR-01). `.env` files are git-ignored.

## Reports

The **Report** page downloads the current project as:

- **PDF** — A4 report with a cover page, KPI table, the four charts (always in the light theme),
  task table, insights, unusual expenses, AI summary, snapshot history and a formula appendix.
  Uses Helvetica (jsPDF's built-in font); DM Sans / Space Grotesk are not embedded because only
  WOFF files are available and jsPDF needs TTF.
- **Excel** — Summary, Tasks, Snapshots, Insights, Anomalies and AI Summary sheets with real
  numbers and number formats.
- **CSV** — the computed task table (UTF-8 with BOM).

Files are named `EVM_<project>_<statusDate>.<ext>`. Text that starts with `= + - @` is prefixed with
`'` so spreadsheets never run it as a formula (SR-04). Examples are in
[docs/sample-reports](docs/sample-reports).

## AI summary (optional)

The Insights page can write an executive summary with Google Gemini. The key stays on a small
server (`apps/ai-proxy`); the browser only sends aggregated metrics, triggered insights and
unusual expenses — never the task table. **Without a key everything still works:** the app
writes a rule-based summary offline and labels it "Generated offline (rule-based)".

### 1. Get a free Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/) and sign in with a Google account.
2. Open **Get API key** (https://aistudio.google.com/apikey) → **Create API key**.
3. Copy the key. Treat it like a password: never paste it into `apps/web` files, chats or commits.

The free tier has per-minute and per-day request limits; the proxy also rate-limits to 10 requests
per minute per IP.

### 2. Choose the model name

The proxy does not guess a model: it refuses to start until `GEMINI_MODEL` is set. In AI Studio,
open the model picker (or see the "Models" page of the Gemini API docs) and copy the exact model
code, for example a current **Flash** model — fast and available on the free tier. Model names
change over time, so check the list rather than copying an old name.

### 3. Run the proxy locally

```sh
cp .env.example .env                          # then fill in GEMINI_API_KEY and GEMINI_MODEL
npm run dev -w apps/ai-proxy                  # http://localhost:3001
curl http://localhost:3001/api/health         # {"status":"ok"}
```

Then point the web app at it and restart the dev server:

```sh
echo VITE_AI_PROXY_URL=http://localhost:3001 > apps/web/.env.local
npm run dev -w apps/web
```

`ALLOWED_ORIGINS` must include the web app's origin (`http://localhost:5173` in dev). The
production build adds the proxy origin to the CSP `connect-src`, so set `VITE_AI_PROXY_URL`
before `npm run build`.

### 4. Deploy the proxy

- **Replit:** run `npm run start -w apps/ai-proxy`; put `GEMINI_API_KEY`, `GEMINI_MODEL` and
  `ALLOWED_ORIGINS` in Replit Secrets.
- **Vercel (free fallback):** import the repo, set the project root to `apps/ai-proxy` with
  "Include files outside the root directory" enabled (it uses `packages/core`), and add the same
  variables under Environment Variables. `api/summary.ts` and `api/health.ts` reuse the Express
  app. See [apps/ai-proxy/README.md](apps/ai-proxy/README.md).
