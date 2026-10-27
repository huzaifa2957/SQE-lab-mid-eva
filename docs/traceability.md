# Traceability matrix

Test-case IDs are defined in [test-cases.md](test-cases.md). "Core" means the calculation is
implemented and tested in `packages/core`; the UI part of the requirement comes in a later phase.

| Req ID | Description                                    | Test case ID(s)                              | Type   | Status      |
| ------ | ---------------------------------------------- | -------------------------------------------- | ------ | ----------- |
| FR-10  | Task-level metrics (§4.1)                      | UT-PV-01…12, UT-EVM-01…08b, UT-WE-01         | Unit   | Pass (core) |
| FR-11  | Project-level metrics (§4.2)                   | UT-EVM-09…22, UT-WE-02                       | Unit   | Pass        |
| FR-12  | Estimated, actual, variance, % variance        | UT-EVM-01, UT-EVM-02, UT-WE-01, UT-WE-02     | Unit   | Pass (core) |
| FR-13  | Undefined values shown as "N/A"                | UT-FMT-05, UT-WE-03                          | Unit   | Pass (core) |
| FR-14  | Choose primary EAC method                      | UT-EVM-18                                    | Unit   | Pass (core) |
| FR-15  | Recalculate when status date changes           | UT-EVM-23                                    | Unit   | Pass (core) |
| RL-01  | Core returns null, never NaN/Infinity          | UT-EVM-08b, UT-EVM-19, UT-FMT-05             | Unit   | Pass        |
| NF-04  | Core ≥ 90% line coverage                       | `npm run test:coverage` (threshold enforced) | Static | Pass        |
| NF-05  | ESLint + Prettier pass in CI; TS strict        | CI `lint`, `format:check`, `typecheck`       | Static | Pass        |
| NF-05  | No `any` in `packages/core`                    | ESLint `no-explicit-any` (core)              | Static | Pass        |
| SR-01  | `.env` git-ignored; `.env.example` committed   | Manual review of `.gitignore`                | Manual | Pass        |
| SR-03  | No `dangerouslySetInnerHTML`                   | ESLint `no-restricted-syntax` (web)          | Static | Pass        |
| SR-07  | `npm audit` clean of high/critical; Dependabot | CI `npm audit --audit-level=high`            | Static | Pass        |
