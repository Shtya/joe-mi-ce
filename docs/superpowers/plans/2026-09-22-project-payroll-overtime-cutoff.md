# Project Payroll Overtime and Cutoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-selectable violation or overtime payroll, cutoff-aware periods, exact-format overtime time sheets, and daily Gatemea time-sheet refreshes.

**Architecture:** Project payroll settings select a pure cutoff-period resolver and one of two automated calculation paths. Violation mode retains its current calculation and normal payroll import/export; overtime mode writes source-journey snapshots that become automatic additions and drives the August-format workbook. Gatemea's existing daily job calls the same service API rather than parsing an Excel file.

**Tech Stack:** NestJS 10, TypeORM/PostgreSQL, Jest/ts-jest, ExcelJS, class-validator, dayjs, existing payroll and reports modules.

**Spec:** `docs/superpowers/specs/2026-09-22-project-payroll-overtime-cutoff-design.md`

## Global Constraints

- Preserve existing violation-mode payroll behavior and normal payroll import/export.
- `payrollCalculationMode` defaults to `violation`; `payrollCutoffDay` defaults to `1` and validates from 1 through 31.
- Interpret `YYYY-MM` as the month containing the period end; paid period dates and snapshots are immutable.
- Overtime is calculated only from a completed journey, shift, check-in/out, and effective salary; never from attendance markers.
- The overtime workbook must retain the supplied August file's visible sheets, headers, ordering, legend, values, and yellow/light-blue attendance styling.
- Do not add new dependencies or change the project's package manager.

---

## File structure

- `entities/project.entity.ts`: project payroll mode and cutoff persistence.
- `entities/payroll/payroll-overtime.entity.ts`: immutable per-journey overtime calculation snapshot.
- `src/payroll/payroll.types.ts`: calculation-mode enum and overtime domain types.
- `src/payroll/payroll-period.ts`: pure cutoff/date and overtime-money functions.
- `src/payroll/payroll.service.ts`: settings updates, cutoff-aware period sync, overtime persistence, workbook import/export orchestration.
- `src/payroll/payroll-timesheet.ts`: ExcelJS creation and validation for the exact overtime workbook format.
- `dto/payroll.dto.ts` and `src/payroll/payroll.controller.ts`: validated settings and time-sheet endpoints.
- `src/payroll/payroll.module.ts`: TypeORM registration for overtime snapshots.
- `src/reports/reports.service.ts` and `src/reports/reports.cron.ts`: Gatemea daily full-period workbook refresh in overtime mode.

### Task 1: Add payroll settings and the cutoff-period domain API

**Files:**
- Modify: `entities/project.entity.ts`
- Modify: `src/payroll/payroll.types.ts`
- Create: `src/payroll/payroll-period.ts`
- Test: `src/payroll/payroll-period.spec.ts`

**Interfaces:**
- Produces `PayrollCalculationMode`, `resolvePayrollPeriod(month, cutoffDay)`, `activePayrollMonth(date, cutoffDay)`, and `calculateOvertimeAmount(input)` for all later tasks.

- [ ] **Step 1: Write failing resolver and overtime tests**

```ts
import {
  calculateOvertimeAmount,
  resolvePayrollPeriod,
} from "./payroll-period";

it("ends a cutoff-25 September period on the 24th", () => {
  expect(resolvePayrollPeriod("2026-09", 25)).toEqual({
    startDate: "2026-08-25",
    endDate: "2026-09-24",
  });
});

it("clamps cutoff 31 for February in a leap year", () => {
  expect(resolvePayrollPeriod("2028-03", 31)).toEqual({
    startDate: "2028-02-29",
    endDate: "2028-03-30",
  });
});

it("pays 90 overtime minutes at the scheduled-shift hourly rate", () => {
  expect(calculateOvertimeAmount({
    monthlySalary: 4_800,
    scheduledShiftMinutes: 480,
    overtimeMinutes: 90,
  })).toBe(30);
});
```

- [ ] **Step 2: Run the domain tests to verify they fail**

Run: `npm test -- payroll-period.spec.ts --runInBand`

Expected: FAIL because `./payroll-period` and its exported functions do not exist.

- [ ] **Step 3: Add the enum, project columns, and minimal pure implementation**

```ts
export enum PayrollCalculationMode {
  VIOLATION = "violation",
  OVERTIME = "overtime",
}

export function resolvePayrollPeriod(month: string, cutoffDay: number) {
  const endBoundary = clampedDate(month, cutoffDay);
  const startBoundary = clampedDate(previousMonth(month), cutoffDay);
  return { startDate: startBoundary, endDate: previousDate(endBoundary) };
}

export function calculateOvertimeAmount(input: {
  monthlySalary: number;
  scheduledShiftMinutes: number;
  overtimeMinutes: number;
}): number {
  return roundMoney(
    (input.monthlySalary / 30 / input.scheduledShiftMinutes) *
      Math.max(0, input.overtimeMinutes),
  );
}
```

Add `payrollCalculationMode` as a TypeORM enum column defaulting to `violation` and `payrollCutoffDay` as a non-null integer column defaulting to `1`.

- [ ] **Step 4: Run the domain tests to verify they pass**

Run: `npm test -- payroll-period.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit the focused change**

```bash
git add entities/project.entity.ts src/payroll/payroll.types.ts src/payroll/payroll-period.ts src/payroll/payroll-period.spec.ts
git commit -m "feat: add payroll cutoff domain settings"
```

### Task 2: Persist and apply overtime calculations during payroll synchronization

**Files:**
- Create: `entities/payroll/payroll-overtime.entity.ts`
- Modify: `entities/payroll/payroll-line.entity.ts`
- Modify: `src/payroll/payroll.module.ts`
- Modify: `src/payroll/payroll.service.ts`
- Test: `src/payroll/payroll-overtime.spec.ts`

**Interfaces:**
- Consumes `PayrollCalculationMode`, `resolvePayrollPeriod`, `calculateMinutesAfterShift`, and `calculateOvertimeAmount`.
- Produces one `PayrollOvertime` row per `sourceJourneyId`, plus `PayrollLine.automaticOvertimeAddition` and a recalculated `netPay`.

- [ ] **Step 1: Write the failing sync behavior test**

```ts
it("adds calculated overtime once and does not create violation deductions in overtime mode", async () => {
  const result = await service.syncPeriod("project-1", "2026-09", actor);
  expect(result.startDate).toBe("2026-08-25");
  expect(savedOvertime).toMatchObject({
    overtimeMinutes: 90,
    amount: "30.00",
  });
  expect(savedLine).toMatchObject({
    attendanceDeduction: "0.00",
    automaticOvertimeAddition: "30.00",
    totalAddition: "30.00",
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- payroll-overtime.spec.ts --runInBand`

Expected: FAIL because overtime snapshots and automatic additions are absent.

- [ ] **Step 3: Implement the smallest persistence path**

Define `PayrollOvertime` with UUID `projectId`, `periodId`, `userId`, unique `sourceJourneyId`, `workDate`, `scheduledShiftMinutes`, `overtimeMinutes`, decimal salary/hourly-rate/amount snapshots, and relations to period/line/user. In `syncPeriod`, obtain dates from `resolvePayrollPeriod(month, project.payrollCutoffDay)`. Branch on `project.payrollCalculationMode`: retain the existing violation loop unchanged for `violation`; for `overtime`, derive overtime only for complete journey records, replace pending-period overtime snapshots, sum by employee, and include the automatic sum in `recalculateLine`.

```ts
const automaticOvertimeAddition = roundMoney(
  overtimeByUser.get(line.userId)?.reduce(
    (sum, item) => sum + Number(item.amount),
    0,
  ) ?? 0,
);
line.automaticOvertimeAddition = automaticOvertimeAddition.toFixed(2);
line.totalAddition = roundMoney(
  automaticOvertimeAddition + manualAdditions,
).toFixed(2);
```

Do not delete or change overtime records for a paid period. Register the new entity in `PayrollModule`.

- [ ] **Step 4: Run the focused payroll tests to verify they pass**

Run: `npm test -- payroll-overtime.spec.ts payroll-calculator.spec.ts payroll-sync.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit the focused change**

```bash
git add entities/payroll/payroll-overtime.entity.ts entities/payroll/payroll-line.entity.ts src/payroll/payroll.module.ts src/payroll/payroll.service.ts src/payroll/payroll-overtime.spec.ts
git commit -m "feat: calculate payroll overtime by journey"
```

### Task 3: Expose and validate project payroll configuration

**Files:**
- Modify: `dto/payroll.dto.ts`
- Modify: `src/payroll/payroll.controller.ts`
- Modify: `src/payroll/payroll.service.ts`
- Test: `src/payroll/payroll-settings.spec.ts`

**Interfaces:**
- Consumes `PayrollCalculationMode`.
- Produces `PATCH /payroll/my-project/settings` accepting partial `enabled`, `calculationMode`, and `cutoffDay` settings.

- [ ] **Step 1: Write failing settings endpoint/service tests**

```ts
it("returns default violation mode and day-one cutoff", async () => {
  await expect(service.getPayrollSettings("project-1", actor as any)).resolves.toEqual({
    projectId: "project-1",
    payrollEnabled: true,
    calculationMode: "violation",
    cutoffDay: 1,
  });
});

it("rejects cutoff day 32", async () => {
  await expect(service.updatePayrollSettings("project-1", { cutoffDay: 32 }, actor as any))
    .rejects.toThrow("cutoffDay must not be greater than 31");
});
```

- [ ] **Step 2: Run the settings test to verify it fails**

Run: `npm test -- payroll-settings.spec.ts --runInBand`

Expected: FAIL because the response and update method do not contain the new settings.

- [ ] **Step 3: Implement DTO validation, controller wiring, and transactional update**

```ts
export class UpdatePayrollSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsEnum(PayrollCalculationMode)
  calculationMode?: PayrollCalculationMode;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(31)
  cutoffDay?: number;
}
```

Keep `SetPayrollEnabledDto` compatible by replacing the controller body type with this DTO. Return all three settings from `getPayrollSettings`. Do not mutate periods that are already paid.

- [ ] **Step 4: Run the settings and authorization tests to verify they pass**

Run: `npm test -- payroll-settings.spec.ts payroll-enable.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit the focused change**

```bash
git add dto/payroll.dto.ts src/payroll/payroll.controller.ts src/payroll/payroll.service.ts src/payroll/payroll-settings.spec.ts
git commit -m "feat: configure payroll mode and cutoff per project"
```

### Task 4: Build and validate the exact overtime time-sheet workbook

**Files:**
- Create: `src/payroll/payroll-timesheet.ts`
- Create: `src/payroll/payroll-timesheet.spec.ts`
- Modify: `src/payroll/payroll.service.ts`
- Modify: `src/payroll/payroll.controller.ts`
- Modify: `dto/payroll.dto.ts`

**Interfaces:**
- Consumes an overtime-mode project, its resolved period, employee/salary data, journey/vacation data, and `PayrollOvertime` snapshots.
- Produces `createOvertimeTimeSheet(input): Promise<Buffer>` and `parseOvertimeTimeSheet(input): ParsedTimeSheet`.

- [ ] **Step 1: Write the failing workbook fidelity test**

```ts
it("creates the supplied August workbook structure with attendance colours", async () => {
  const workbook = await workbookFrom(await createOvertimeTimeSheet(fixture));
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
    "Employees_DB",
    "September 26",
  ]);
  expect(workbook.getWorksheet("September 26")!.getRow(1).getCell(13).value)
    .toBe("26/08/2026 Wed");
  expect(workbook.getWorksheet("September 26")!.getCell("S2").fill.fgColor?.argb)
    .toBe("FFFFFF00");
});
```

- [ ] **Step 2: Run the workbook test to verify it fails**

Run: `npm test -- payroll-timesheet.spec.ts --runInBand`

Expected: FAIL because no workbook creator exists.

- [ ] **Step 3: Implement exact visible workbook structure and guarded import**

Use ExcelJS. Create `Employees_DB` and a named period sheet with the same visible headers/order as the supplied workbook: 12 identity/salary columns, one date column for every resolved period day, then `Paid Days`, `Daily Rate`, `Calculated Salary`, `Deduction`, `Bonus`, `Final Salary`, and `Lateness`. Add the supplied bilingual legend below the data. Use `FFFF00` yellow weekly-off fill and `DDEBF7` light-blue late-over-15-minutes fill. Preserve string attendance symbols `1`, `0`, `V`, `R`, and `N`; populate numeric monetary cells.

Put workbook version, project ID, period ID, and overtime values in a hidden `_payroll_metadata` sheet so visible August-format sheets remain unchanged. The parser must reject a missing/wrong metadata version, mismatched project or period, duplicate identity, unknown date columns, and values outside the allowed symbol set. It must collect all row errors before returning and save no rows until validation succeeds.

- [ ] **Step 4: Add mode-protected download/import endpoints and verify tests pass**

Add `GET /payroll/my-project/time-sheet-template?month=YYYY-MM` and multipart `POST /payroll/my-project/time-sheet-import`. Both call `requireOvertimeProject` and return a conflict error for violation mode. Run:

`npm test -- payroll-timesheet.spec.ts payroll-settings.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit the focused change**

```bash
git add src/payroll/payroll-timesheet.ts src/payroll/payroll-timesheet.spec.ts src/payroll/payroll.service.ts src/payroll/payroll.controller.ts dto/payroll.dto.ts
git commit -m "feat: export overtime payroll timesheets"
```

### Task 5: Refresh Gatemea's complete overtime workbook every day

**Files:**
- Modify: `src/reports/reports.service.ts`
- Modify: `src/reports/reports.cron.ts`
- Modify: `src/reports/reports.module.ts`
- Test: `src/reports/reports.service.spec.ts`
- Test: `src/reports/reports.cron.spec.ts`

**Interfaces:**
- Consumes exported `PayrollService.refreshDailyOvertimeTimeSheet(projectId, now)`.
- Produces an August-format workbook for the entire active cutoff period, populated through the prior Riyadh business day.

- [ ] **Step 1: Write a failing Gatemea daily-workflow test**

```ts
it("refreshes Gatemea's full active-period overtime time sheet once per daily run", async () => {
  await cron.handleGatemeaReport();
  expect(payrollService.refreshDailyOvertimeTimeSheet).toHaveBeenCalledWith(
    "gatemea-project",
    expect.any(Date),
  );
});
```

- [ ] **Step 2: Run the reports cron test to verify it fails**

Run: `npm test -- reports.cron.spec.ts --runInBand`

Expected: FAIL because `ReportsCron` does not receive or invoke `PayrollService`.

- [ ] **Step 3: Add the daily orchestration with no Excel re-import**

Inject `PayrollService` into `ReportsModule` through `PayrollModule`, then into `ReportsCron`. In `handleGatemeaReport`, after locating the Gatemea project, call `refreshDailyOvertimeTimeSheet` only when its payroll is enabled and its mode is `overtime`. The method resolves the active cutoff period, syncs completed journeys through yesterday, and returns a complete workbook buffer/path created by Task 4. Attach or retain that workbook through the existing report-delivery path; never parse the generated report back into payroll.

- [ ] **Step 4: Run report and payroll integration tests to verify they pass**

Run: `npm test -- reports.service.spec.ts reports.cron.spec.ts payroll-overtime.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit the focused change**

```bash
git add src/reports/reports.service.ts src/reports/reports.cron.ts src/reports/reports.module.ts src/reports/reports.service.spec.ts src/reports/reports.cron.spec.ts
git commit -m "feat: refresh Gatemea overtime timesheet daily"
```

### Task 6: Run full verification and record deployment implications

**Files:**
- Modify: `docs/superpowers/specs/2026-09-22-project-payroll-overtime-cutoff-design.md`

**Interfaces:**
- Consumes all completed tasks.
- Produces evidence that the full test suite and build pass, plus database deployment notes.

- [ ] **Step 1: Run focused tests together**

Run: `npm test -- payroll-period.spec.ts payroll-overtime.spec.ts payroll-timesheet.spec.ts payroll-settings.spec.ts reports.service.spec.ts reports.cron.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 2: Run repository verification**

Run: `npm test -- --runInBand`

Expected: PASS.

Run: `npm run lint`

Expected: exits 0 after the repository formatter/linter applies no remaining changes.

Run: `npm run build`

Expected: exits 0 and creates a production Nest build.

- [ ] **Step 3: Document database deployment requirement**

Append a short deployment note explaining that production has `synchronize: false`, so the deployment must include a reviewed TypeORM migration adding project settings, the automatic overtime addition column, and the overtime snapshot table/indexes before application rollout.

- [ ] **Step 4: Commit verification documentation**

```bash
git add docs/superpowers/specs/2026-09-22-project-payroll-overtime-cutoff-design.md
git commit -m "docs: record payroll overtime deployment checks"
```

## Plan self-review

- Spec coverage: Task 1 covers cutoff correctness and project defaults; Task 2 covers overtime calculation, persistence, and immutable snapshots; Task 3 covers settings API; Task 4 covers exact workbook import/export; Task 5 covers Gatemea's whole-period daily regeneration; Task 6 covers production migration and verification.
- Placeholder scan: no deferred requirements or unspecified error handling remain; each task states its test behavior, code boundary, and command.
- Type consistency: all later tasks use the Task 1 names `PayrollCalculationMode`, `resolvePayrollPeriod`, and `calculateOvertimeAmount`; Task 5 consumes `refreshDailyOvertimeTimeSheet` defined in Task 2/4 service work.
