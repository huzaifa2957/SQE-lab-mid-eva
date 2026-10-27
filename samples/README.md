# samples

Templates, a sample project and deliberately broken files (PROJECT_PLAN §9). Every file here is
loaded by `packages/core/tests/samples.test.ts`, so changing one may break a test.

## Templates and sample project

| File                      | Contents                                                                    |
| ------------------------- | --------------------------------------------------------------------------- |
| `tasks_template.csv`      | Header row only — the required task columns                                 |
| `sample_project_info.csv` | Project sheet: Clinic Building Extension, PKR, 2026-01-05 → 2026-06-26, status date 2026-04-03 |
| `sample_project.csv`      | 12 tasks; BAC 1,040,000; at the status date EV 496,000, AC 570,000, PV 522,926.41 (CPI 0.87, SPI 0.95) |
| `sample_periods.csv`      | 6 fortnightly snapshots. CPI 1.04 → 1.02 → 0.99 → 0.95 → 0.91 → 0.87: healthy, then declining. The last snapshot equals the task totals at the status date |

The sample project is expected to trigger IN-03 (CPI < 0.90), IN-05 (SPI 0.90–1.00), IN-09
(TCPI > 1.10), IN-10, IN-11 (CPI falling) and IN-12; and AN-01 (task 3.1 cost-variance outlier) and
AN-02 (task 3.2 spent with 0% complete).

The `.xlsx` template (`Project`, `Tasks`, `Periods` sheets) is added in Phase 3.

## Invalid files

| File                            | Problem                                                     | Expected result                 |
| ------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| `invalid_missing_column.csv`    | No `Actual Cost` column                                     | VR-03 error                     |
| `invalid_negative_cost.csv`     | Actual Cost −500 (row 3), Budget −20000 (row 4)             | VR-06 errors                    |
| `invalid_percent_over_100.csv`  | % Complete 120 (row 3)                                      | VR-07 error                     |
| `invalid_bad_dates.csv`         | 2026-02-30, "next week", finish before start               | VR-08 errors (rows 2, 3, 4)     |
| `invalid_duplicate_ids.csv`     | Task ID 1.2 twice (rows 3 and 4)                            | VR-04 error                     |
| `invalid_empty.csv`             | 0 bytes                                                     | VR-15 error                     |
| `invalid_wrong_extension.txt`   | Valid CSV content, wrong extension                          | VR-01 error                     |
| `invalid_formula_injection.csv` | Task names starting `=`, `+`, `@`, `-` and an HTML `<script>` | VR-16 warnings; import allowed, text kept literally (escaped on export, SR-04) |
