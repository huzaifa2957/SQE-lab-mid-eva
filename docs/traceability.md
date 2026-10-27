# Traceability matrix

Test-case IDs are defined in [test-cases.md](test-cases.md). "Core" means the logic is implemented
and tested in `packages/core`; the UI part of the requirement comes in a later phase.
`-P` tests show the rule passing (no issue raised); `-F` tests show it failing (issue raised).

## Functional requirements

| Req ID | Description                                 | Test case ID(s)                                         | Type             | Status      |
| ------ | ------------------------------------------- | ------------------------------------------------------- | ---------------- | ----------- |
| FR-01  | Create/edit/delete a project                | UT-VR-09-P/F/F2, UT-VAL-05, CT-PRJ-01…03                | Unit + Component | Pass        |
| FR-02  | Editable task table, inline validation      | UT-VAL-01…03, UT-HLP-04, CT-TASK-02…05                  | Unit + Component | Pass        |
| FR-03  | Upload .csv / .xlsx (drop or picker)        | UT-XL-02…05, CT-IMP-01…04, CT-IMP-06                    | Unit + Component | Pass        |
| FR-04  | Download template (.xlsx + tasks .csv)      | UT-XL-01, UT-XL-02, UT-XL-06                            | Unit             | Pass        |
| FR-05  | Import preview with per-row errors/warnings | UT-VR-\*, UT-SMP-05/06, CT-IMP-01, CT-IMP-02, CT-IMP-05 | Unit + Component | Pass        |
| FR-06  | Tolerant column mapping                     | UT-PAR-13…15, UT-VR-03-P                                | Unit             | Pass        |
| FR-07  | "Record status" saves a snapshot            | UT-SNAP-01…03, CT-TASK-07                               | Unit + Component | Pass        |
| FR-08  | Save/load .evm.json; auto-save locally      | UT-PF-01…06, UT-ST-01/02, CT-PF-01…06, CT-TASK-03       | Unit + Component | Pass        |
| FR-09  | Load the built-in sample project            | CT-PRJ-04                                               | Component        | Pass        |
| FR-10  | Task-level metrics (§4.1)                   | UT-PV-01…12, UT-EVM-01…08b, UT-WE-01                    | Unit             | Pass (core) |
| FR-11  | Project-level metrics (§4.2)                | UT-EVM-09…22, UT-WE-02                                  | Unit             | Pass        |
| FR-12  | Estimated, actual, variance, % variance     | UT-EVM-01/02, UT-WE-01/02, CT-TASK-01                   | Unit + Component | Pass        |
| FR-13  | Undefined values shown as "N/A" + reason    | UT-FMT-05, UT-WE-03, CT-TASK-09                         | Unit + Component | Pass        |
| FR-14  | Choose primary EAC method                   | UT-EVM-18 (UI: Settings page)                           | Unit             | Pass (core) |
| FR-15  | Recalculate when status date changes        | UT-EVM-23, CT-TASK-06                                   | Unit + Component | Pass        |
| FR-26  | Insights panel (rules §5)                   | UT-IN-00…13, UT-SMP-03                                  | Unit             | Pass (core) |
| FR-27  | Overall health badge                        | UT-IN-14, UT-IN-15, UT-SMP-03                           | Unit             | Pass (core) |
| FR-30  | Anomaly detection AN-01…AN-06               | UT-AN-00…08, UT-SMP-03                                  | Unit             | Pass (core) |

## Insight rules (§5)

| Rule  | Condition                           | Passing case | Failing case              | Status |
| ----- | ----------------------------------- | ------------ | ------------------------- | ------ |
| IN-01 | CPI ≥ 1.00 → green                  | UT-IN-01-P   | UT-IN-01-F                | Pass   |
| IN-02 | 0.90 ≤ CPI < 1.00 → amber           | UT-IN-02-P   | UT-IN-02-F                | Pass   |
| IN-03 | CPI < 0.90 → red                    | UT-IN-03-P   | UT-IN-03-F, UT-IN-01-03-N | Pass   |
| IN-04 | SPI ≥ 1.00 → green                  | UT-IN-04-P   | UT-IN-04-F                | Pass   |
| IN-05 | 0.90 ≤ SPI < 1.00 → amber           | UT-IN-05-P   | UT-IN-05-F                | Pass   |
| IN-06 | SPI < 0.90 → red                    | UT-IN-06-P   | UT-IN-06-F                | Pass   |
| IN-07 | CPI ≥ 1 and SPI < 1 → info          | UT-IN-07-P   | UT-IN-07-F                | Pass   |
| IN-08 | CPI < 1 and SPI ≥ 1 → info          | UT-IN-08-P   | UT-IN-08-F                | Pass   |
| IN-09 | TCPI > 1.10 → red                   | UT-IN-09-P   | UT-IN-09-F                | Pass   |
| IN-10 | VAC < 0 → red (≤ −10%) / amber      | UT-IN-10-P   | UT-IN-10-F                | Pass   |
| IN-11 | CPI falling for 3 consecutive steps | UT-IN-11-P   | UT-IN-11-F                | Pass   |
| IN-12 | Top 3 tasks by negative CV          | UT-IN-12-P   | UT-IN-12-F                | Pass   |

## Anomaly rules (FR-30)

| Rule  | Condition                                  | Passing case            | Failing case | Status |
| ----- | ------------------------------------------ | ----------------------- | ------------ | ------ |
| AN-01 | Task CV% outlier (z-score n ≥ 5, else IQR) | UT-AN-01-P, UT-AN-01-P2 | UT-AN-01-F   | Pass   |
| AN-02 | AC > 0 at 0% complete                      | UT-AN-02-P              | UT-AN-02-F   | Pass   |
| AN-03 | AC > budget while < 100% complete          | UT-AN-03-P              | UT-AN-03-F   | Pass   |
| AN-04 | Period AC increase > 2× median increase    | UT-AN-04-P              | UT-AN-04-F   | Pass   |
| AN-05 | % complete decreased between snapshots     | UT-AN-05-P              | UT-AN-05-F   | Pass   |
| AN-06 | 100% complete, AC < 50% of budget          | UT-AN-06-P              | UT-AN-06-F   | Pass   |

## Validation rules (§7)

| Rule  | Rule                                               | Passing case | Failing case(s)                       | Sample file test              | Status |
| ----- | -------------------------------------------------- | ------------ | ------------------------------------- | ----------------------------- | ------ |
| VR-01 | `.csv`/`.xlsx` only; MIME checked                  | UT-VR-01-P   | UT-VR-01-F                            | UT-SMP-07 (wrong extension)   | Pass   |
| VR-02 | ≤ 5 MB; ≤ 5,000 rows                               | UT-VR-02-P   | UT-VR-02-F                            | —                             | Pass   |
| VR-03 | Required columns present                           | UT-VR-03-P   | UT-VR-03-F, UT-VAL-06                 | UT-SMP-05 (missing column)    | Pass   |
| VR-04 | Task ID unique, non-empty, ≤ 20 chars              | UT-VR-04-P   | UT-VR-04-F, UT-VAL-03                 | UT-SMP-05 (duplicate IDs)     | Pass   |
| VR-05 | Task Name 1–100 chars, trimmed                     | UT-VR-05-P   | UT-VR-05-F                            | —                             | Pass   |
| VR-06 | Budget/AC numeric, 0–1e12, tolerant formats        | UT-VR-06-P   | UT-VR-06-F, UT-VAL-06, UT-VAL-07      | UT-SMP-05 (negative cost)     | Pass   |
| VR-07 | % Complete 0–100; "45%"; fraction confirmation     | UT-VR-07-P   | UT-VR-07-F                            | UT-SMP-05 (% over 100)        | Pass   |
| VR-08 | Valid dates; finish ≥ start                        | UT-VR-08-P   | UT-VR-08-F                            | UT-SMP-05 (bad dates)         | Pass   |
| VR-09 | Project end > start; status ≥ start                | UT-VR-09-P   | UT-VR-09-F, UT-VAL-05                 | —                             | Pass   |
| VR-10 | Task dates outside project (warning)               | UT-VR-10-P   | UT-VR-10-F, UT-VAL-02                 | —                             | Pass   |
| VR-11 | Budget = 0 (warning)                               | UT-VR-11-P   | UT-VR-11-F, UT-VAL-02                 | —                             | Pass   |
| VR-12 | AC > 0 with 0% complete (warning)                  | UT-VR-12-P   | UT-VR-12-F, UT-VAL-02                 | UT-SMP-01 (sample task 3.2)   | Pass   |
| VR-13 | Total BAC > 0                                      | UT-VR-13-P   | UT-VR-13-F                            | —                             | Pass   |
| VR-14 | Snapshot dates ascending; EV/AC non-decreasing     | UT-VR-14-P   | UT-VR-14-F, UT-VR-14-F2, UT-VR-14-F3  | UT-SMP-01 (clean periods)     | Pass   |
| VR-15 | Blank rows skipped; empty file rejected            | UT-VR-15-P   | UT-VR-15-F                            | UT-SMP-04, UT-SMP-05 (empty)  | Pass   |
| VR-16 | Control chars stripped; formulas/HTML kept literal | UT-VR-16-P   | UT-VR-16-F, UT-VR-16-F2, UT-PAR-16…18 | UT-SMP-08 (formula injection) | Pass   |

## Non-functional and security

| Req ID | Description                                                       | Test case ID(s)                                                                  | Type             | Status  |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------- | ------- |
| RL-01  | Core returns null, never NaN/Infinity                             | UT-EVM-08b, UT-EVM-19, UT-FMT-05                                                 | Unit             | Pass    |
| RL-02  | Parse errors are user-readable with row/column                    | UT-SMP-06, UT-VR-\*-F, CT-IMP-02…04, CT-PF-03/04                                 | Unit + Component | Pass    |
| RL-03  | Error boundary with Reload / Export data                          | CT-ERR-01                                                                        | Component        | Pass    |
| RL-04  | Confirm + undo before replacing data                              | CT-IMP-01, CT-PF-05, CT-PRJ-03, CT-TASK-04, CT-TASK-07                           | Component        | Pass    |
| NF-03  | Labels, keyboard use, focus ring, icon + colour; WCAG AA contrast | CT-CON-\* (44 checks), CT-TASK-02/05, CT-THEME-\*                                | Component        | Pass    |
| NF-04  | Core ≥ 90% line coverage; overall ≥ 70%                           | `npm run test:coverage` (thresholds enforced)                                    | Static           | Pass    |
| NF-05  | ESLint + Prettier pass in CI; TS strict                           | CI `lint`, `format:check`, `typecheck`                                           | Static           | Pass    |
| NF-05  | No `any` in `packages/core`                                       | ESLint `no-explicit-any` (core)                                                  | Static           | Pass    |
| SR-01  | `.env` git-ignored; `.env.example` committed                      | Manual review of `.gitignore`                                                    | Manual           | Pass    |
| SR-03  | No `dangerouslySetInnerHTML`; user text as plain text             | ESLint `no-restricted-syntax` (web), UT-XL-03, UT-SMP-08                         | Static + Unit    | Pass    |
| SR-05  | Content-Security-Policy meta tag in the build                     | Manual: `dist/index.html` contains the CSP; ExcelJS chunk checked for eval paths | Manual           | Pass    |
| SR-04  | Formula-injection text detected on import                         | UT-PAR-18, UT-SMP-08 (export escaping: Phase 6)                                  | Unit             | Partial |
| SR-07  | `npm audit` clean of high/critical; Dependabot                    | CI `npm audit --audit-level=high`                                                | Static           | Pass    |
