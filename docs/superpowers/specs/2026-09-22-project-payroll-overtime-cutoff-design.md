# Project Payroll Overtime and Cutoff Design

## Goal

Extend project payroll with a selectable calculation mode, project-specific payroll cutoffs, an auditable overtime calculation, and a time-sheet Excel workflow that preserves the supplied August format and attendance legend.

## Decisions

- Payroll remains project-scoped and available only when `payrollEnabled` is true.
- Each project has `payrollCalculationMode`, with `violation` as the default and `overtime` as the alternative.
- Each project has `payrollCutoffDay`, an integer from 1 through 31, defaulting to 1.
- A period begins on the resolved cutoff date and ends on the day before the next resolved cutoff date. For example, cutoff 25 creates 25 August through 24 September. A period labelled `2026-09` is the period ending in September.
- A cutoff day that does not exist in a calendar month resolves to that month’s final day. A cutoff of 31 therefore resolves to 30 in a 30-day month and to 29 or 28 in February.
- Existing paid periods retain their recorded date range and calculation totals. Changing a project's mode or cutoff affects only newly generated or still-pending periods.

## Project payroll settings

`Project` gains the following persisted settings:

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `payrollCalculationMode` | enum: `violation`, `overtime` | `violation` | Selects the automated calculation applied during a payroll sync. |
| `payrollCutoffDay` | integer 1–31 | `1` | Defines the first date of every payroll period. |

The authenticated project administrator who already has payroll-management permission may read and update these settings through the existing payroll settings endpoint. Validation rejects values outside 1–31 and unknown modes.

## Payroll period resolution

The month query remains `YYYY-MM`, but it identifies the month in which the period ends. This preserves the existing default behavior: cutoff 1 and month `2026-09` means 1–30 September.

For a non-default cutoff, the resolver calculates the end boundary in the requested month, then derives the start boundary from the prior month. It must be a pure function and must cover leap years and transitions around February.

Examples:

| Cutoff | Requested period | Start date | End date |
| --- | --- | --- | --- |
| 1 | 2026-09 | 2026-09-01 | 2026-09-30 |
| 25 | 2026-09 | 2026-08-25 | 2026-09-24 |
| 31 | 2026-03 | 2026-02-28 | 2026-03-30 |
| 31 | 2028-03 | 2028-02-29 | 2028-03-30 |

The daily payroll scheduler determines the active period from the Riyadh business date and synchronizes it. At the cutoff boundary it finishes the prior period and begins the next one without overlap or gaps.

## Calculation modes

### Violation mode

Violation mode preserves the current behavior. The sync derives late arrival and early leave from journeys, shifts, and check-ins, applies the enabled project violation rules, and writes deductions and immutable violation snapshots to the payroll line.

### Overtime mode

Overtime mode does not generate violation deductions. It calculates additional pay only from completed employee journeys in the resolved payroll-period date range.

For every journey with a scheduled shift and both check-in and check-out timestamps:

1. Derive minutes after the scheduled shift end, including overnight shifts.
2. Ignore zero or negative overtime.
3. Calculate the shift length in minutes, including overnight shifts.
4. Use the salary effective on the journey date and calculate:

```text
daily wage = monthly salary / 30
hourly wage = daily wage / scheduled shift hours
overtime amount = overtime minutes × hourly wage / 60
```

5. Round the resulting monetary value to two decimal places and attach it to the pending payroll line as an automatic overtime addition.

The generated overtime record stores the project, payroll period, employee, source journey, work date, scheduled shift minutes, overtime minutes, salary/hourly-rate snapshots, and calculated amount. It has a unique source-journey relationship so repeated daily syncs do not duplicate pay. A paid line retains its snapshots.

## Time-sheet import and export

The supplied `AUG Time Sheet 2026 for 67.xlsx` is the layout reference. The generated workbook must preserve its recognizable attendance format:

- an employee directory sheet and a period time-sheet sheet;
- employee identity and salary fields followed by one date column per resolved payroll-period day;
- the bilingual legend and the same attendance symbols: `1` for present/one shift, `0` for absent, `V` for vacation, `R` for resignation, and `N` for new promoter;
- the same visual convention: weekly rest day highlighted yellow and late over fifteen minutes highlighted light blue;
- summary columns for paid days, daily rate, calculated salary, deductions, bonus, final salary, and lateness;
- read-only overtime-hours and overtime-amount values derived from stored overtime records.

The time-sheet creator derives attendance symbols from the authoritative journey and approved-vacation data. It does not infer hours from a present marker. In particular, existing values such as `1.75` or `2` are not treated as overtime hours.

The importer accepts only the generated time-sheet structure (including an explicit version marker). It validates period boundaries, project membership, unique employee identity, date columns, and allowed symbols before it writes any attendance overrides. It returns every rejected worksheet row with a reason and performs no partial write on invalid input. Importing an older August-style workbook without the marker is supported only as a preview/validation result until its employee identifiers and period are explicitly mapped; it cannot silently alter payroll.

## Gatemea scheduled workflow

The Gatemea daily report already has access to attendance journeys. For a payroll-enabled Gatemea project in overtime mode, its daily job will also synchronize that Riyadh business day into the active payroll period using the same overtime domain calculator.

The job does not parse a temporary Excel file back into payroll. It records the source journey and calculation snapshot directly in the database, then produces the Excel time sheet/report from those stored records. This makes the process repeatable, prevents duplicate overtime from rerunning a cron job, and leaves an audit trail for every amount in the final cut-off payroll.

At the cutoff, the normal payroll sync completes the period, totals the overtime additions, and produces the final workbook for the closed date range. If the daily job was missed, a manual or scheduled period sync rebuilds the same result from journeys.

## Data integrity and error handling

- Paid payroll periods are immutable.
- A project setting change never rewrites paid dates, violation records, overtime records, or payroll snapshots.
- Overtime requires a valid salary, shift, check-in, and check-out. Missing source data is reported/skipped rather than converted to a zero or guessed value.
- Automatic overtime additions are kept distinct from manual adjustments so payroll totals are explainable.
- All sync and import changes are transactional and idempotent.
- The workbook uses numeric salary and amount cells, date values for date columns, and controlled string values only for attendance symbols.

## API shape

- `GET /payroll/my-project/settings` returns enabled status, calculation mode, and cutoff day.
- `PATCH /payroll/my-project/settings` accepts `enabled`, `calculationMode`, and/or `cutoffDay` and applies authorization and validation.
- `GET /payroll/my-project/time-sheet-template?month=YYYY-MM` downloads the project’s cutoff-aware Excel workbook.
- `POST /payroll/my-project/time-sheet-import` validates and imports a generated workbook for a requested period, returning accepted and rejected rows.
- Existing period sync/list/detail endpoints expose resolved dates, mode snapshot, and itemized overtime additions.

## Testing and verification

- Unit tests for cutoff boundaries, 30-day months, non-leap February, leap February, and contiguous periods.
- Unit tests for normal and overnight overtime, no overtime, missing clock-out, shift-length hourly-rate calculation, and money rounding.
- Service tests for default settings, mode update authorization/validation, a cutoff-aware sync, paid-period locking, and duplicate-safe daily sync.
- Workbook tests that verify the supplied symbols, bilingual legend, yellow weekly-off fill, light-blue lateness fill, resolved date headers, numeric calculation cells, and import validation/rollback.
- Gatemea report tests that prove the overtime-mode daily job records source data exactly once and the cutoff payroll includes its addition.
- Run the repository's Jest tests, lint script, and production build after implementation.

## Non-goals

- Changing salaries from a time-sheet import.
- Inferring overtime from attendance values such as `1`, `1.75`, or `2`.
- Reopening or recalculating a paid payroll period.
- Replacing the existing Gatemea operational report for projects that are not in overtime mode.
