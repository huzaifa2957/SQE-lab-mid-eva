# Traceability matrix

| Req ID | Description                                    | Test case ID(s)                        | Type   | Status |
| ------ | ---------------------------------------------- | -------------------------------------- | ------ | ------ |
| NF-05  | ESLint + Prettier pass in CI; TS strict        | CI `lint`, `format:check`, `typecheck` | Static | Pass   |
| NF-05  | No `any` in `packages/core`                    | ESLint `no-explicit-any` (core)        | Static | Pass   |
| SR-01  | `.env` git-ignored; `.env.example` committed   | Manual review of `.gitignore`          | Manual | Pass   |
| SR-03  | No `dangerouslySetInnerHTML`                   | ESLint `no-restricted-syntax` (web)    | Static | Pass   |
| SR-07  | `npm audit` clean of high/critical; Dependabot | CI `npm audit --audit-level=high`      | Static | Pass   |
