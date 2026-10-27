# EVM Cost Tracker

Earned Value Management cost-control tool: a static web app and an Electron desktop app sharing one tested calculation core. See [PROJECT_PLAN.md](PROJECT_PLAN.md) for requirements and phases.

## Structure

```
packages/core   pure TS: formulas, validation, insights, anomalies
apps/web        React + Vite + Tailwind (static build)
apps/desktop    Electron shell (Phase 7)
apps/ai-proxy   Gemini proxy (Phase 5)
samples/        templates and test files
docs/           SRS, test plan, traceability
```

## Getting started

Requires Node.js 20.19+.

```sh
npm install
npm run dev -w apps/web     # http://localhost:5173
```

## Scripts

| Command                     | What it does                            |
| --------------------------- | --------------------------------------- |
| `npm run lint`              | ESLint (zero warnings allowed)          |
| `npm run format:check`      | Prettier check                          |
| `npm run typecheck`         | `tsc` in every workspace                |
| `npm run test`              | Vitest across core and web              |
| `npm run test:coverage`     | Tests with V8 coverage (NF-04)          |
| `npm run build -w apps/web` | Production web build to `apps/web/dist` |

## Configuration

Copy `.env.example` to `.env`. API keys never go in client code or Git (SR-01).
