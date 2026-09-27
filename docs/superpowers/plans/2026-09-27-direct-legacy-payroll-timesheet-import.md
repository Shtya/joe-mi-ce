# Direct Legacy Payroll Time-sheet Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the supplied August workbook directly, derive its payroll period from date headers, preserve the source format in Gatemea output, and persist the shift-unit data needed for payroll summaries.

**Architecture:** Extend the workbook parser with a metadata-free legacy branch and a shared normalized attendance-row model. Store paid shift units and attendance classification alongside the existing override symbol, so generated sheets and pending payroll calculations can use imported attendance without trusting legacy summary cells. The import service derives the period, validates it against the project cutoff, ensures the next pending period exists, and remains transactional.

**Tech Stack:** NestJS, TypeORM, ExcelJS, Jest.

**Spec:** `docs/superpowers/specs/2026-09-22-project-payroll-overtime-cutoff-design.md`

## Global Constraints

- Work directly on `main`; the user explicitly authorized this workspace.
- Preserve the supplied workbook’s visible layout, sheets, colors, headers, and legend wording, including blank English text for `N`.
- Overtime remains journey-and-shift-time based; numeric attendance units never invent overtime minutes.
- Paid payroll periods remain immutable.
- Direct imports must be all-or-nothing.

---

### Task 1: Normalize legacy attendance and derive its period

**Files:**
- Modify: `src/payroll/payroll-timesheet.ts`
- Test: `src/payroll/payroll-timesheet.spec.ts`

**Interfaces:**
- Produces `detectTimeSheetPeriod(buffer): Promise<{ startDate: string; endDate: string; month: string }>`.
- Extends parsed rows with `paidShiftUnits` and `attendanceKind`.

- [ ] Write a failing workbook test without `_payroll_metadata` using July 26–August 25 headers, `2`, `1.75`, yellow `1`, blue `1`, and the exact supplied legend; expect month `2026-08`, quantities, and classifications.
- [ ] Run `npm test -- payroll-timesheet --runInBand` and confirm the test fails because legacy metadata-free workbooks are rejected.
- [ ] Implement header-date discovery, period derivation, numeric-unit validation, color classification, and exact `N` legend wording.
- [ ] Re-run the focused workbook test and existing workbook tests.
- [ ] Commit the isolated parser change.

### Task 2: Persist normalized imported data and render it

**Files:**
- Modify: `entities/payroll/payroll-timesheet-override.entity.ts`
- Modify: `src/payroll/payroll.service.ts`
- Modify: `src/payroll/payroll-timesheet.ts`
- Test: `src/payroll/payroll-timesheet.spec.ts`

**Interfaces:**
- `PayrollTimeSheetOverride` stores `paidShiftUnits` and `attendanceKind` with the existing period/user/date unique key.
- Generated workbooks overlay imported numeric units and their attendance colors and recompute summaries.

- [ ] Write failing tests that an imported `2` appears as `2`, `1.75` appears as `1.75`, weekly-off keeps yellow, late keeps blue, and the summary derives paid units rather than trusting source summary cells.
- [ ] Run the focused tests and confirm failure.
- [ ] Add entity fields, propagate them through import upsert and export mapping, and calculate workbook paid-day/summary cells from units.
- [ ] Re-run focused workbook/service tests.
- [ ] Commit the persistence/rendering change.

### Task 3: Import directly by detected date range and create the following period

**Files:**
- Modify: `dto/payroll.dto.ts`
- Modify: `src/payroll/payroll.controller.ts`
- Modify: `src/payroll/payroll.service.ts`
- Test: `src/payroll/payroll-timesheet.spec.ts`
- Test: `src/payroll/payroll-sync.spec.ts`

**Interfaces:**
- `POST /payroll/my-project/time-sheet-import` accepts an optional `month`; omitted month is derived from headers.
- Response includes `month`, `startDate`, and `endDate`.

- [ ] Write failing service tests that a metadata-free August import for cutoff 26 resolves `2026-08`, saves rows transactionally, and creates the pending `2026-09` period without changing a paid period.
- [ ] Run the focused tests and confirm failure.
- [ ] Implement cutoff-window validation, auto period lookup/creation, period locking, optional-month DTO validation, and response metadata.
- [ ] Re-run focused payroll tests.
- [ ] Commit the direct import service change.

### Task 4: Verify Gatemea progression and deployment documentation

**Files:**
- Modify: `src/payroll/payroll-overtime.spec.ts`
- Modify: `src/reports/reports.cron.spec.ts`
- Modify: `docs/superpowers/specs/2026-09-22-project-payroll-overtime-cutoff-design.md`

- [ ] Write a failing test that cutoff-26 Gatemea produces the August format for September and advances to October at the September cutoff, preserving imported unit/color rendering.
- [ ] Run the Gatemea-focused test and confirm failure.
- [ ] Make the minimal cron/workbook correction required for that test.
- [ ] Update production schema documentation for `paidShiftUnits` and `attendanceKind`.
- [ ] Run `npm test -- payroll reports --runInBand --cache=false`, then `npm run build`.
- [ ] Commit documentation and final behavior.

### Task 5: Final verification

**Files:**
- Modify: `.superpowers/sdd/2026-09-22-project-payroll-overtime-cutoff/progress.md`

- [ ] Inspect `git diff --check` and `git status --short`.
- [ ] Run the focused tests and build from a clean checkout state.
- [ ] Run the full Jest suite; record existing unrelated failures rather than masking them.
- [ ] Update the delivery ledger with verification results and remaining production migration action.
- [ ] Commit the verification ledger.
