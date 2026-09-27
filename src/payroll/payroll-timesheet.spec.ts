import * as ExcelJS from "exceljs";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { PayrollService } from "./payroll.service";
import { Project } from "entities/project.entity";
import { User } from "entities/user.entity";
import { EmployeeSalary } from "entities/payroll/employee-salary.entity";
import { PayrollPeriod } from "entities/payroll/payroll-period.entity";
import { PayrollLine } from "entities/payroll/payroll-line.entity";
import { PayrollAdjustment } from "entities/payroll/payroll-adjustment.entity";
import { PayrollLineViolation } from "entities/payroll/payroll-line-violation.entity";
import { PayrollViolation } from "entities/payroll/payroll-violation.entity";
import { PayrollViolationRule } from "entities/payroll/payroll-violation-rule.entity";
import {
  CheckIn,
  Journey,
  JourneyPlan,
  JourneyStatus,
} from "entities/all_plans.entity";
import { PayrollTimeSheetOverride } from "entities/payroll/payroll-timesheet-override.entity";
import { PayrollOvertime } from "entities/payroll/payroll-overtime.entity";
import { Vacation } from "entities/employee/vacation.entity";
import { VacationDate } from "entities/employee/vacation-date.entity";
import { ERole } from "enums/Role.enum";
import { PayrollCalculationMode, PayrollPeriodStatus } from "./payroll.types";
import {
  createOvertimeTimeSheet,
  detectTimeSheetPeriod,
  parseOvertimeTimeSheet,
  OverTimeSheetInput,
} from "./payroll-timesheet";

const fixture: OverTimeSheetInput = {
  projectId: "project-1",
  period: {
    id: "period-1",
    month: "2026-09",
    startDate: "2026-08-26",
    endDate: "2026-09-25",
  },
  throughDate: "2026-09-24",
  employees: [
    {
      userId: "user-1",
      identity: "1234567890",
      name: "Employee",
      monthlySalary: 3000,
      attendance: [
        { workDate: "2026-08-26", present: true, lateMinutes: 16 },
        { workDate: "2026-09-01", weeklyOff: true },
        { workDate: "2026-08-27", vacation: true },
      ],
      overrides: [{ workDate: "2026-08-28", symbol: "R" }],
      overtime: [{ workDate: "2026-08-26", overtimeMinutes: 60, amount: 12.5 }],
    },
  ],
};

async function workbookFrom(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

async function parse(workbook: ExcelJS.Workbook) {
  return parseOvertimeTimeSheet({
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    ...fixture,
  });
}

describe("overtime time sheet", () => {
  it("preserves the supplied visible sheets, headers, legend, dates and attendance colours", async () => {
    const workbook = await workbookFrom(await createOvertimeTimeSheet(fixture));
    expect(
      workbook.worksheets
        .filter((sheet) => sheet.state === "visible")
        .map((sheet) => sheet.name),
    ).toEqual(["Employees_DB", "September 26"]);
    expect(workbook.getWorksheet("Employees_DB")!.getCell("A1").value).toBe(
      "-+",
    );
    const sheet = workbook.getWorksheet("September 26")!;
    expect(sheet.getCell("A1").value).toBe("Iqama");
    expect(sheet.getCell("M1").value).toEqual(new Date("2026-08-26T00:00:00Z"));
    expect(sheet.getCell("M1").numFmt).toBe("dd/mm/yyyy ddd");
    expect(sheet.getCell("S2").fill).toMatchObject({
      fgColor: { argb: "FFFFFF00" },
    });
    expect(sheet.getCell("M2").fill).toMatchObject({
      fgColor: { argb: "FFDDEBF7" },
    });
    expect(sheet.getCell("M2").value).toBe("1");
    expect(sheet.getCell("N2").value).toBe("V");
    expect(sheet.getCell("O2").value).toBe("R");
    expect(sheet.getCell("P2").value).toBe("0");
    expect(sheet.getCell("AQ2").value).toBeNull();
    expect(sheet.getRow(1).values).toEqual(
      expect.arrayContaining([
        "Paid Days",
        "Daily Rate",
        "Calculated Salary",
        "Deduction",
        "Bonus",
        "Final Salary",
        "Lateness",
      ]),
    );
    expect(sheet.getCell("I2").value).toBe(3000);
    expect(sheet.getCell("AV2").value).toBe(12.5);
    expect(sheet.getCell("AS2").value).toBe(96.77);
    expect(sheet.getCell("B2").fill).toMatchObject({
      fgColor: { argb: "FFB2A1C7" },
    });
    expect(sheet.getCell("AR2").fill).toMatchObject({
      fgColor: { argb: "FFCCC0D9" },
    });
    expect(sheet.getCell("AU2").fill).toMatchObject({
      fgColor: { argb: "FFD6E3BC" },
    });
    expect(sheet.getCell("AS2").numFmt).toBe("0");
    expect(sheet.getCell("A4").value).toBe("فهرس الرموز / Legend");
    expect(sheet.getCell("C8").value).toBe(
      "Lateness over 15 minutes (light blue fill)",
    );
    expect(workbook.getWorksheet("_payroll_metadata")!.state).toBe(
      "veryHidden",
    );
  });

  it("round trips symbols against stable employee identities", async () => {
    const workbook = await workbookFrom(await createOvertimeTimeSheet(fixture));
    const result = await parse(workbook);
    expect(result.rejectedRows).toEqual([]);
    expect(result.rows).toContainEqual(
      expect.objectContaining({
        userId: "user-1",
        workDate: "2026-08-28",
        symbol: "R",
        paidShiftUnits: 0,
        attendanceKind: "resigned",
      }),
    );
    expect(result.rows).toHaveLength(30);
  });

  it("imports the original metadata-free August workbook with fractional and double shifts", async () => {
    const legacyFixture: OverTimeSheetInput = {
      ...fixture,
      period: {
        id: "period-august",
        month: "2026-08",
        startDate: "2026-07-26",
        endDate: "2026-08-25",
      },
      throughDate: "2026-08-25",
    };
    const workbook = await workbookFrom(
      await createOvertimeTimeSheet(legacyFixture),
    );
    const metadata = workbook.getWorksheet("_payroll_metadata")!;
    workbook.removeWorksheet(metadata.id);
    const sheet = workbook.getWorksheet("August 26")!;
    sheet.getCell("M2").value = 2;
    sheet.getCell("N2").value = 1.75;
    sheet.getCell("O2").value = 1;
    sheet.getCell("O2").style = {
      ...sheet.getCell("O2").style,
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFFF00" },
      },
    };
    sheet.getCell("P2").value = 1;
    sheet.getCell("P2").style = {
      ...sheet.getCell("P2").style,
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDDEBF7" },
      },
    };
    sheet.getCell("C12").value = "";

    const result = await parseOvertimeTimeSheet({
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      ...legacyFixture,
    });

    expect(result.rejectedRows).toEqual([]);
    await expect(
      detectTimeSheetPeriod(Buffer.from(await workbook.xlsx.writeBuffer())),
    ).resolves.toEqual({
      month: "2026-08",
      startDate: "2026-07-26",
      endDate: "2026-08-25",
    });
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "user-1",
          workDate: "2026-07-26",
          symbol: "1",
          paidShiftUnits: 2,
          attendanceKind: "present",
        }),
        expect.objectContaining({
          workDate: "2026-07-27",
          paidShiftUnits: 1.75,
          attendanceKind: "present",
        }),
        expect.objectContaining({
          workDate: "2026-07-28",
          paidShiftUnits: 1,
          attendanceKind: "weekly_off",
        }),
        expect.objectContaining({
          workDate: "2026-07-29",
          paidShiftUnits: 1,
          attendanceKind: "late",
        }),
      ]),
    );
  });

  it("accepts an unrecorded blank day on same-day import without creating an override", async () => {
    const workbook = await workbookFrom(await createOvertimeTimeSheet(fixture));
    const sheet = workbook.getWorksheet("September 26")!;
    sheet.getCell("AQ2").value = "";
    const result = await parseOvertimeTimeSheet({
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      ...fixture,
      throughDate: "2026-09-25",
    });

    expect(result.rejectedRows).toEqual([]);
    expect(result.rows).not.toContainEqual(
      expect.objectContaining({ workDate: "2026-09-25" }),
    );
  });

  it("still rejects a populated attendance value beyond the recorded date", async () => {
    const workbook = await workbookFrom(await createOvertimeTimeSheet(fixture));
    workbook.getWorksheet("September 26")!.getCell("AQ2").value = "1";
    const result = await parse(workbook);

    expect(result.rejectedRows).toContainEqual({
      rowNumber: 2,
      reason: "Future attendance is not allowed for 2026-09-25",
    });
    expect(result.rows).toEqual([]);
  });

  it("accepts source-style numeric legend symbols and empty formatted trailing rows", async () => {
    const workbook = await workbookFrom(await createOvertimeTimeSheet(fixture));
    const sheet = workbook.getWorksheet("September 26")!;
    for (const address of ["A6", "A7", "A8"]) sheet.getCell(address).value = 1;
    sheet.getCell("A9").value = 0;
    sheet.getCell("A20").numFmt = "0";
    const result = await parse(workbook);
    expect(result.rejectedRows).toEqual([]);
    expect(result.rows).toHaveLength(30);
  });

  it.each(["version", "project", "period"])(
    "rejects %s metadata",
    async (kind) => {
      const workbook = await workbookFrom(
        await createOvertimeTimeSheet(fixture),
      );
      const metadata = workbook.getWorksheet("_payroll_metadata")!;
      metadata.getCell(
        { version: "B1", project: "B2", period: "B3" }[kind]!,
      ).value = "wrong";
      const result = await parse(workbook);
      expect(result.rejectedRows.length).toBeGreaterThan(0);
      expect(result.rows).toEqual([]);
    },
  );

  it("collects every invalid attendance cell and rejects formulas and more than two shifts", async () => {
    const workbook = await workbookFrom(await createOvertimeTimeSheet(fixture));
    const sheet = workbook.getWorksheet("September 26")!;
    sheet.getCell("M2").value = 2.01;
    sheet.getCell("N2").value = "X";
    sheet.getCell("O2").value = { formula: "1", result: 1 };
    const result = await parse(workbook);
    expect(result.rejectedRows).toHaveLength(3);
    expect(result.rows).toEqual([]);
  });

  it("rejects duplicate employees and unknown dates", async () => {
    const workbook = await workbookFrom(await createOvertimeTimeSheet(fixture));
    const sheet = workbook.getWorksheet("September 26")!;
    sheet.getRow(3).values = sheet.getRow(2).values;
    sheet.getCell("M1").value = new Date("2026-08-25T00:00:00Z");
    const result = await parse(workbook);
    expect(
      result.rejectedRows.some((row) => row.reason.includes("Duplicate")),
    ).toBe(true);
    expect(
      result.rejectedRows.some((row) => row.reason.includes("header")),
    ).toBe(true);
    expect(result.rows).toEqual([]);
  });

  it("rejects a changed employee directory header", async () => {
    const workbook = await workbookFrom(await createOvertimeTimeSheet(fixture));
    workbook.getWorksheet("Employees_DB")!.getCell("A1").value = "User ID";
    const result = await parse(workbook);
    expect(result.rows).toEqual([]);
    expect(
      result.rejectedRows.some((row) =>
        row.reason.includes("directory header"),
      ),
    ).toBe(true);
  });

  it.each(["X", "1"])(
    "rejects a duplicate employee appended after the legend with attendance %s",
    async (symbol) => {
      const workbook = await workbookFrom(
        await createOvertimeTimeSheet(fixture),
      );
      const sheet = workbook.getWorksheet("September 26")!;
      sheet.getRow(14).values = sheet.getRow(2).values;
      sheet.getCell("M14").value = symbol;
      const result = await parse(workbook);
      expect(result.rejectedRows).toContainEqual({
        rowNumber: 14,
        reason: "Unexpected populated row after the workbook legend",
      });
      expect(result.rows).toEqual([]);
    },
  );

  it.each(["description", "extra attendance", "missing row"])(
    "rejects a malformed legend: %s",
    async (change) => {
      const workbook = await workbookFrom(
        await createOvertimeTimeSheet(fixture),
      );
      const sheet = workbook.getWorksheet("September 26")!;
      if (change === "description")
        sheet.getCell("C8").value = "Changed description";
      if (change === "extra attendance") sheet.getCell("M8").value = "1";
      if (change === "missing row") sheet.getRow(8).values = [];
      const result = await parse(workbook);
      expect(result.rejectedRows).toContainEqual({
        rowNumber: 8,
        reason: "Invalid workbook legend row",
      });
      expect(result.rows).toEqual([]);
    },
  );

  it("never trusts metadata to authorize an employee from a different project", async () => {
    const workbook = await workbookFrom(await createOvertimeTimeSheet(fixture));
    const result = await parseOvertimeTimeSheet({
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      ...fixture,
      employees: [],
    });
    expect(result.rows).toEqual([]);
    expect(result.rejectedRows.length).toBeGreaterThan(0);
  });

  it("rejects an identity whose hidden user mapping no longer matches the project roster", async () => {
    const workbook = await workbookFrom(await createOvertimeTimeSheet(fixture));
    workbook.getWorksheet("_payroll_metadata")!.getCell("B7").value =
      "another-user";
    const result = await parse(workbook);
    expect(result.rows).toEqual([]);
    expect(
      result.rejectedRows.some((row) =>
        row.reason.includes("identity mapping"),
      ),
    ).toBe(true);
  });

  it("uses authoritative net pay while keeping overtime snapshots in the existing Bonus column", async () => {
    const workbook = await workbookFrom(
      await createOvertimeTimeSheet({
        ...fixture,
        employees: [
          {
            ...fixture.employees[0],
            netPay: 2990,
            manualBonus: 5,
            deduction: 27.5,
          },
        ],
      }),
    );
    const sheet = workbook.getWorksheet("September 26")!;
    expect(sheet.getCell("AW2").value).toBe(2990);
    expect(sheet.getCell("AV2").value).toBe(17.5);
    expect(sheet.getCell("AU2").value).toBe(27.5);
  });
});

describe("overtime time sheet service boundaries", () => {
  const actor = Object.assign(new User(), {
    id: "admin-1",
    project_id: "project-1",
    role: { name: ERole.PROJECT_ADMIN, hasPermission: () => true },
  });
  async function createService(mode = PayrollCalculationMode.OVERTIME) {
    const period = {
      ...fixture.period,
      projectId: fixture.projectId,
      status: PayrollPeriodStatus.PENDING,
    };
    const written: unknown[] = [];
    const user = Object.assign(new User(), {
      id: "user-1",
      national_id: "1234567890",
      username: "employee",
      project_id: "project-1",
    });
    const databaseRows = new Map<Function, unknown[]>([[User, [user]]]);
    const manager = {
      findOne: jest.fn().mockResolvedValue(period),
      save: jest.fn(async (value) => value),
      upsert: jest.fn(async (entity, values) => {
        if (entity === PayrollTimeSheetOverride) written.push(...values);
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
      getRepository: (entity: Function) => ({
        find: async () => databaseRows.get(entity) ?? [],
      }),
    };
    const module = await Test.createTestingModule({
      providers: [
        PayrollService,
        { provide: DataSource, useValue: dataSource },
        ...[
          Project,
          User,
          EmployeeSalary,
          PayrollPeriod,
          PayrollLine,
          PayrollAdjustment,
          PayrollLineViolation,
          PayrollViolation,
          PayrollViolationRule,
          CheckIn,
          Journey,
          Vacation,
          VacationDate,
        ].map((entity) => ({
          provide: getRepositoryToken(entity),
          useValue:
            entity === Project
              ? {
                  findOne: async () => ({
                    id: "project-1",
                    payrollEnabled: true,
                    payrollCalculationMode: mode,
                    payrollCutoffDay: 26,
                  }),
                }
              : entity === PayrollPeriod
                ? { findOne: async () => period }
                : { find: async () => databaseRows.get(entity) ?? [] },
        })),
      ],
    }).compile();
    return {
      service: module.get(PayrollService),
      written,
      dataSource,
      period,
      databaseRows,
      user,
    };
  }

  it("rejects both overtime endpoints for violation-mode projects", async () => {
    const { service } = await createService(PayrollCalculationMode.VIOLATION);
    await expect(
      service.getOvertimeTimeSheet("project-1", "2026-09", actor),
    ).rejects.toThrow("overtime mode");
    await expect(
      service.importOvertimeTimeSheet(
        "project-1",
        { buffer: Buffer.alloc(0) },
        { month: "2026-09" },
        actor,
      ),
    ).rejects.toThrow("overtime mode");
  });

  it.each(["attendance", "trailing row"])(
    "saves no override when the workbook contains invalid %s",
    async (invalidPart) => {
      const { service, written, dataSource } = await createService();
      const workbook = await workbookFrom(
        await createOvertimeTimeSheet(fixture),
      );
      const sheet = workbook.getWorksheet("September 26")!;
      if (invalidPart === "attendance") sheet.getCell("M2").value = "X";
      else {
        sheet.getRow(14).values = sheet.getRow(2).values;
        sheet.getCell("M14").value = "X";
      }
      const result = await service.importOvertimeTimeSheet(
        "project-1",
        { buffer: Buffer.from(await workbook.xlsx.writeBuffer()) },
        { month: "2026-09" },
        actor,
        "2026-09-24",
      );
      expect(result.rejectedRows).toHaveLength(1);
      expect(written).toEqual([]);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    },
  );

  it("atomically persists attendance overrides with actor and project scope", async () => {
    const { service, written } = await createService();
    const result = await service.importOvertimeTimeSheet(
      "project-1",
      { buffer: await createOvertimeTimeSheet(fixture) },
      {},
      actor,
      "2026-09-24",
    );
    expect(result.rejectedRows).toEqual([]);
    expect(result).toMatchObject({
      month: "2026-09",
      startDate: "2026-08-26",
      endDate: "2026-09-25",
    });
    expect(written).toHaveLength(30);
    expect(written).toContainEqual(
      expect.objectContaining({
        projectId: "project-1",
        periodId: "period-1",
        userId: "user-1",
        workDate: "2026-08-28",
        symbol: "R",
        paidShiftUnits: "0.00",
        attendanceKind: "resigned",
        updatedById: "admin-1",
      }),
    );
  });

  it("resolves a direct legacy row by the assigned member mobile", async () => {
    const { service, written, user } = await createService();
    user.national_id = null;
    user.username = "gate-010";
    user.name = "Different stored display name";
    user.mobile = "570588298";
    const workbook = await workbookFrom(await createOvertimeTimeSheet(fixture));
    const metadata = workbook.getWorksheet("_payroll_metadata")!;
    workbook.removeWorksheet(metadata.id);
    const sheet = workbook.getWorksheet("September 26")!;
    sheet.getCell("A2").value = 3952706582;
    sheet.getCell("B2").value = "Abd-ALLAH Zaher";
    sheet.getCell("C2").value = 570588298;

    const result = await service.importOvertimeTimeSheet(
      "project-1",
      { buffer: Buffer.from(await workbook.xlsx.writeBuffer()) },
      { month: "2026-09" },
      actor,
      "2026-09-24",
    );

    expect(result.rejectedRows).toEqual([]);
    expect(written).toContainEqual(
      expect.objectContaining({ userId: "user-1" }),
    );
  });

  it("rejects paid periods and project outsiders without persisting anything", async () => {
    const { service, written, period } = await createService();
    period.status = PayrollPeriodStatus.PAID;
    await expect(
      service.importOvertimeTimeSheet(
        "project-1",
        { buffer: await createOvertimeTimeSheet(fixture) },
        { month: "2026-09" },
        actor,
      ),
    ).rejects.toThrow("Paid payroll periods");
    await expect(
      service.getOvertimeTimeSheet("project-2", "2026-09", actor),
    ).rejects.toThrow("payroll access");
    expect(written).toEqual([]);
  });

  it("exports approved vacations, scheduled weekly off, late journeys, persisted overrides and overtime snapshots", async () => {
    const { service, databaseRows, user } = await createService();
    databaseRows.set(PayrollLine, [
      {
        userId: user.id,
        grossSalary: "3000",
        totalDeduction: "20",
        totalAddition: "17.5",
        automaticOvertimeAddition: "12.5",
        netPay: "2997.5",
      },
    ]);
    databaseRows.set(JourneyPlan, [
      {
        user,
        days: [
          "monday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ],
      },
    ]);
    databaseRows.set(Journey, [
      {
        user,
        date: "2026-08-26",
        status: JourneyStatus.CLOSED,
        checkin: { checkInTime: new Date("2026-08-26T06:16:00Z") },
        shift: { startTime: "09:00", endTime: "17:00" },
      },
    ]);
    databaseRows.set(VacationDate, [
      { date: "2026-08-27", vacation: { user } },
    ]);
    databaseRows.set(PayrollTimeSheetOverride, [
      {
        userId: user.id,
        workDate: "2026-08-28",
        symbol: "1",
        paidShiftUnits: "1.75",
        attendanceKind: "present",
      },
    ]);
    databaseRows.set(PayrollOvertime, [
      {
        userId: user.id,
        workDate: "2026-08-26",
        overtimeMinutes: 60,
        amount: "12.5",
      },
    ]);
    const workbook = await workbookFrom(
      await service.getOvertimeTimeSheet(
        "project-1",
        "2026-09",
        actor,
        "2026-09-24",
      ),
    );
    const sheet = workbook.getWorksheet("September 26")!;
    expect(sheet.getCell("M2").value).toBe("1");
    expect(sheet.getCell("M2").fill).toMatchObject({
      fgColor: { argb: "FFDDEBF7" },
    });
    expect(sheet.getCell("N2").value).toBe("V");
    expect(sheet.getCell("O2").value).toBe(1.75);
    expect(sheet.getCell("S2").fill).toMatchObject({
      fgColor: { argb: "FFFFFF00" },
    });
    expect(sheet.getCell("AV2").value).toBe(17.5);
    expect(sheet.getCell("AW2").value).toBe(2997.5);
  });
});
