# CLAUDE.md — EVM Cost Tracker

Read `PROJECT_PLAN.md` before starting any task. It is the source of truth for requirements (FR/VR/SR/NF IDs), formulas (§4), insight rules (§5) and phases (§10). Work on one phase at a time unless told otherwise.

## Project
Earned Value Management cost tracker: web app (React + Vite, static, hosted on Replit free plan) and desktop app (Electron) sharing `packages/core`.

## Commands
- `npm install` — install all workspaces
- `npm run dev -w apps/web` — run web app
- `npm run test` — run all Vitest tests
- `npm run lint` / `npm run typecheck`
- `npm run build -w apps/web`
- `npm run dist -w apps/desktop` — build Windows installer

## Rules
- All business logic (formulas, validation, insights, anomalies) goes in `packages/core` as pure, tested functions. UI code never re-implements a formula.
- Math functions return `number | null`; never `NaN`/`Infinity`. Display `null` as "N/A" with a reason tooltip.
- Round only at display time.
- Every new rule or formula gets tests for both the passing and failing case.
- Validate all external input (files, forms, AI responses) with Zod.
- Never put API keys in client code or commit them. Use env vars; update `.env.example`.
- No `dangerouslySetInnerHTML`. Sanitise AI output.
- Escape spreadsheet formula prefixes (`= + - @`) on export.
- Electron: keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- TypeScript strict; no `any` in `packages/core`.
- Reference requirement IDs in commit messages, e.g. `feat(core): EAC methods (FR-11, FR-14)`.
- After finishing a phase: run lint, typecheck and tests, update `docs/traceability.md`, and summarise what was done and what's next.
