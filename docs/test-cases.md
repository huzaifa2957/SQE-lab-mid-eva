# Test cases — calculation core (Phase 1)

Unit tests live in `packages/core/tests/`. Every test name starts with its test-case ID so results
can be traced from the Vitest output to this document and to [traceability.md](traceability.md).

Run with `npm run test` (or `npm run test:coverage`).

## 1. Conventions and assumptions

- **Dates** are ISO `YYYY-MM-DD`, compared as whole UTC days. Day counts below are
  `finish − start` (e.g. 1 Mar → 11 Mar = 10 days).
- **PV** spreads each task's budget linearly over its planned duration:
  `PV = budget × clamp((status − start) / (finish − start), 0, 1)`.
  A task with start = finish (milestone) has PV 0 before that date and its full budget on/after it.
- **Undefined maths** (divide by zero, invalid date) returns `null`, displayed as `N/A`. No function
  returns `NaN` or `Infinity`.
- **Rounding** is display-only (2 dp). Hand calculations below are exact; the tests compare
  unrounded values (using `toBeCloseTo` with 6–12 decimal places where floating point can't
  represent the exact fraction, e.g. 0.8).
- **Primary EAC** is the typical method (BAC / CPI) unless stated; ETC and VAC use the primary EAC.

## 2. Worked example (UT-WE-01 … UT-WE-03)

Fixture: `packages/core/tests/fixtures/worked-example.ts`.

**Project:** Worked Example — Office Fit-out · USD · 2026-01-01 → 2026-04-30 · **status date 2026-03-11**

| Task | Name                 | Budget | Planned start | Planned finish | % complete | Actual cost |
| ---- | -------------------- | -----: | ------------- | -------------- | ---------: | ----------: |
| T1   | Site survey          | 10,000 | 2026-01-01    | 2026-01-31     |        100 |      12,000 |
| T2   | Partition walls      | 20,000 | 2026-03-01    | 2026-03-21     |         40 |      10,000 |
| T3   | Electrical           | 40,000 | 2026-03-01    | 2026-04-10     |         20 |      12,000 |
| T4   | Furniture            | 20,000 | 2026-04-01    | 2026-04-30     |          0 |           0 |
| T5   | Permit approval (ms) | 10,000 | 2026-03-05    | 2026-03-05     |         60 |       6,000 |

The tasks are chosen so that each PV case appears once: finished in the past (T1), partly elapsed
(T2, T3), not started (T4) and a zero-duration milestone (T5).

### 2.1 Planned value (step by step)

| Task | Duration (days)      | Elapsed at 03-11 (days) | Fraction           | PV = budget × fraction |
| ---- | -------------------- | ----------------------- | ------------------ | ---------------------: |
| T1   | 01-01 → 01-31 = 30   | 69 (past finish)        | clamp(69/30) = 1   |    10,000 × 1 = 10,000 |
| T2   | 03-01 → 03-21 = 20   | 10                      | 10/20 = 0.5        |  20,000 × 0.5 = 10,000 |
| T3   | 03-01 → 04-10 = 40\* | 10                      | 10/40 = 0.25       | 40,000 × 0.25 = 10,000 |
| T4   | 04-01 → 04-30 = 29   | −21 (before start)      | clamp(−21/29) = 0  |         20,000 × 0 = 0 |
| T5   | 0 (milestone)        | status ≥ 03-05          | 1 (milestone rule) |    10,000 × 1 = 10,000 |

\* March has 31 days: 03-01 → 04-01 = 31, + 9 = 40.

### 2.2 Task-level metrics (§4.1)

EV = budget × % complete / 100 · Variance = budget − AC · Var% = variance / budget × 100 ·
CV = EV − AC · SV = EV − PV · CPI = EV / AC · SPI = EV / PV

| Task | EV                    | Variance | Var % | CV     | SV     | CPI                    | SPI                  |
| ---- | --------------------- | -------: | ----: | ------ | ------ | ---------------------- | -------------------- |
| T1   | 10,000 × 1.0 = 10,000 |   −2,000 |  −20% | −2,000 | 0      | 10,000/12,000 = 0.8333 | 10,000/10,000 = 1.00 |
| T2   | 20,000 × 0.4 = 8,000  |   10,000 |   50% | −2,000 | −2,000 | 8,000/10,000 = 0.80    | 8,000/10,000 = 0.80  |
| T3   | 40,000 × 0.2 = 8,000  |   28,000 |   70% | −4,000 | −2,000 | 8,000/12,000 = 0.6667  | 8,000/10,000 = 0.80  |
| T4   | 20,000 × 0 = 0        |   20,000 |  100% | 0      | 0      | AC = 0 → **N/A**       | PV = 0 → **N/A**     |
| T5   | 10,000 × 0.6 = 6,000  |    4,000 |   40% | 0      | −4,000 | 6,000/6,000 = 1.00     | 6,000/10,000 = 0.60  |

### 2.3 Project totals and metrics (§4.2)

| Metric         | Calculation                                        |                     Result |
| -------------- | -------------------------------------------------- | -------------------------: |
| BAC            | 10,000 + 20,000 + 40,000 + 20,000 + 10,000         |                **100,000** |
| PV             | 10,000 + 10,000 + 10,000 + 0 + 10,000              |                 **40,000** |
| EV             | 10,000 + 8,000 + 8,000 + 0 + 6,000                 |                 **32,000** |
| AC             | 12,000 + 10,000 + 12,000 + 0 + 6,000               |                 **40,000** |
| Variance       | BAC − AC = 100,000 − 40,000                        |                     60,000 |
| Variance %     | 60,000 / 100,000 × 100                             |                        60% |
| CV             | EV − AC = 32,000 − 40,000                          |                     −8,000 |
| SV             | EV − PV = 32,000 − 40,000                          |                     −8,000 |
| CV%            | −8,000 / 32,000 × 100                              |                       −25% |
| SV%            | −8,000 / 40,000 × 100                              |                       −20% |
| CPI            | 32,000 / 40,000                                    |                       0.80 |
| SPI            | 32,000 / 40,000                                    |                       0.80 |
| EAC (typical)  | BAC / CPI = 100,000 / 0.8                          |                    125,000 |
| EAC (atypical) | AC + (BAC − EV) = 40,000 + 68,000                  |                    108,000 |
| EAC (combined) | AC + (BAC − EV)/(CPI × SPI) = 40,000 + 68,000/0.64 | 40,000 + 106,250 = 146,250 |
| ETC (typical)  | EAC − AC = 125,000 − 40,000                        |                     85,000 |
| VAC (typical)  | BAC − EAC = 100,000 − 125,000                      |                    −25,000 |
| VAC% (typical) | −25,000 / 100,000 × 100                            |                       −25% |
| TCPI           | (BAC − EV)/(BAC − AC) = 68,000 / 60,000            |       1.1333… (shown 1.13) |
| % complete     | EV / BAC × 100 = 32,000 / 100,000 × 100            |                        32% |
| % spent        | AC / BAC × 100 = 40,000 / 100,000 × 100            |                        40% |

With the **atypical** method as primary (UT-EVM-18): ETC = 108,000 − 40,000 = 68,000;
VAC = 100,000 − 108,000 = −8,000; VAC% = −8%. With **combined**: VAC = 100,000 − 146,250 = −46,250.

**Interpretation:** the project is 32% complete but has spent 40% of its budget, and is behind
schedule (SPI 0.80). Forecast overrun at completion is 25,000 (typical method); finishing on budget
would require a TCPI of 1.13, i.e. working 13% more efficiently than planned for the rest of the
project.

### 2.4 Display (UT-WE-03)

`$125,000.00` (EAC) · `-$25,000.00` (VAC) · `1.13` (TCPI) · `0.83` (T1 CPI) · `N/A` (T4 CPI).

## 3. Edge-case test cases

### 3.1 Planned value — `tests/pv.test.ts`

| ID       | Case                                        | Expected              |
| -------- | ------------------------------------------- | --------------------- |
| UT-PV-01 | Valid ISO dates, datetime suffix, leap day  | Parsed day number     |
| UT-PV-02 | Malformed / impossible dates (`2026-02-30`) | `null`                |
| UT-PV-03 | Status date **before start**                | PV = 0                |
| UT-PV-04 | Status date on start                        | PV = 0                |
| UT-PV-05 | Midpoint / partial; 1/3 not rounded         | budget × fraction     |
| UT-PV-06 | Status date on finish                       | PV = budget           |
| UT-PV-07 | Status date **after finish**                | PV = budget (clamped) |
| UT-PV-08 | Start = finish, before the date             | PV = 0                |
| UT-PV-09 | Start = finish, on/after the date           | PV = budget           |
| UT-PV-10 | Finish before start                         | `null`                |
| UT-PV-11 | Invalid task or status date                 | `null`                |
| UT-PV-12 | **Zero budget**; NaN/Infinity budget        | 0; `null`             |

### 3.2 EVM formulas — `tests/evm.test.ts`

| ID         | Formula / case                                        | Edge case covered                               |
| ---------- | ----------------------------------------------------- | ----------------------------------------------- |
| UT-EVM-01  | Variance = budget − AC                                | over / under / equal                            |
| UT-EVM-02  | Var% = (budget − AC) / budget × 100                   | **budget = 0 → N/A**                            |
| UT-EVM-03  | EV = budget × % / 100                                 | 0%, 100%, zero budget                           |
| UT-EVM-04  | CV = EV − AC, SV = EV − PV                            | null propagation                                |
| UT-EVM-05  | CPI = EV / AC                                         | **AC = 0 → N/A**                                |
| UT-EVM-06  | SPI = EV / PV                                         | **PV = 0 → N/A**                                |
| UT-EVM-07  | All task metrics together                             | —                                               |
| UT-EVM-08  | Task metrics                                          | zero budget, AC = 0, before start, after finish |
| UT-EVM-08b | Task metrics with NaN/Infinity inputs and bad dates   | null, never NaN                                 |
| UT-EVM-09  | BAC = Σ budget                                        | empty list → 0                                  |
| UT-EVM-10  | CV% = CV / EV × 100                                   | EV = 0 → N/A                                    |
| UT-EVM-11  | SV% = SV / PV × 100                                   | PV = 0 → N/A                                    |
| UT-EVM-12  | EAC typical = BAC / CPI                               | CPI null or 0 → N/A                             |
| UT-EVM-13  | EAC atypical = AC + (BAC − EV)                        | —                                               |
| UT-EVM-14  | EAC combined = AC + (BAC − EV)/(CPI × SPI)            | either index null or 0 → N/A                    |
| UT-EVM-15  | ETC, VAC, VAC%                                        | null EAC propagates; BAC = 0 → N/A              |
| UT-EVM-16  | TCPI = (BAC − EV)/(BAC − AC)                          | **BAC = AC → N/A**; AC > BAC                    |
| UT-EVM-17  | % complete, % spent                                   | BAC = 0 → N/A                                   |
| UT-EVM-18  | Primary EAC method drives ETC / VAC (FR-14)           | default = typical                               |
| UT-EVM-19  | No NaN/Infinity for 10,000 input combinations (RL-01) | 0, ±1e12, 1e-300, null, NaN, ∞                  |
| UT-EVM-20  | Intermediate values not rounded                       | CPI = 1/3                                       |
| UT-EVM-21  | Empty project                                         | BAC = 0                                         |
| UT-EVM-22  | One task with invalid dates                           | PV-based → N/A, cost-based kept                 |
| UT-EVM-23  | Status date change recalculates (FR-15)               | —                                               |

### 3.3 Formatting — `tests/format.test.ts`

| ID        | Case                                 | Expected                        |
| --------- | ------------------------------------ | ------------------------------- |
| UT-FMT-01 | Currency, 2 dp, grouping, negative   | `$1,234.50`, `-$2,000.00`       |
| UT-FMT-02 | Other ISO code; invalid code         | `PKR 1,234.50`; `code 1,234.50` |
| UT-FMT-03 | Percent, 2 dp                        | `-25.00%`                       |
| UT-FMT-04 | Index, 2 dp                          | `0.80`, `1.13`                  |
| UT-FMT-05 | null / undefined / NaN / ±Infinity   | `N/A`                           |
| UT-FMT-06 | Tiny negatives                       | no `-0.00`                      |
| UT-FMT-07 | Formatting does not change the value | display-only rounding           |
