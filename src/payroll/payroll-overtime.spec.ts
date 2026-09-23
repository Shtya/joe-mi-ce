import { Journey } from "entities/all_plans.entity";
import { EmployeeSalary } from "entities/payroll/employee-salary.entity";
import { PayrollAdjustment } from "entities/payroll/payroll-adjustment.entity";
import { PayrollLineViolation } from "entities/payroll/payroll-line-violation.entity";
import { PayrollLine } from "entities/payroll/payroll-line.entity";
import { PayrollOvertime } from "entities/payroll/payroll-overtime.entity";
import { PayrollPeriod } from "entities/payroll/payroll-period.entity";
import { PayrollViolationRule } from "entities/payroll/payroll-violation-rule.entity";
import { PayrollViolation } from "entities/payroll/payroll-violation.entity";
import { ERole } from "enums/Role.enum";
import { PayrollService } from "./payroll.service";
import { PayrollCalculationMode, PayrollPeriodStatus } from "./payroll.types";

describe("PayrollService overtime synchronization", () => {
  it("refreshes the newly active cutoff period on cutoff day with an empty source range", async () => {
    const projectId = "gatemea-project";
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((_entity: unknown, values: object) => values),
      save: jest.fn(async (value: object) => value),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const service = new PayrollService(
      { transaction: jest.fn((work) => work(manager)) } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: projectId,
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.OVERTIME,
          payrollCutoffDay: 25,
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const expectedWorkbook = Buffer.from("time-sheet");
    jest
      .spyOn(service, "getOvertimeTimeSheet")
      .mockResolvedValue(expectedWorkbook);

    const result = await service.refreshDailyOvertimeTimeSheet(
      projectId,
      new Date("2026-09-25T08:00:00.000Z"),
    );

    expect(result).toBe(expectedWorkbook);
    // On cutoff day, closing period 2026-09 is finalized and new period 2026-10 is initialized
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        month: "2026-09",
        startDate: "2026-08-25",
        endDate: "2026-09-24",
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        month: "2026-10",
        startDate: "2026-09-25",
        endDate: "2026-10-24",
      }),
    );
    // Returns the closing period workbook through its final completed day
    expect(service.getOvertimeTimeSheet).toHaveBeenCalledWith(
      projectId,
      "2026-09",
      undefined,
      "2026-09-24",
    );
  });

  it("refreshes the active period workbook on a non-cutoff day", async () => {
    const projectId = "21963b9d-0f5c-4c10-a990-00cb1fc9bda3";
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((_entity: unknown, values: object) => values),
      save: jest.fn(async (value: object) => value),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const service = new PayrollService(
      { transaction: jest.fn((work) => work(manager)) } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: projectId,
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.OVERTIME,
          payrollCutoffDay: 25,
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const expectedWorkbook = Buffer.from("time-sheet");
    jest
      .spyOn(service, "getOvertimeTimeSheet")
      .mockResolvedValue(expectedWorkbook);

    // 2026-09-30 (Wednesday) is a mid-week date; previous Riyadh business date is 2026-09-29 (Tuesday)
    const result = await service.refreshDailyOvertimeTimeSheet(
      projectId,
      new Date("2026-09-30T08:00:00.000Z"),
    );

    expect(result).toBe(expectedWorkbook);
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        month: "2026-10",
        startDate: "2026-09-25",
        endDate: "2026-10-24",
      }),
    );
    expect(service.getOvertimeTimeSheet).toHaveBeenCalledWith(
      projectId,
      "2026-10",
      undefined,
      "2026-09-29",
    );
  });

  it("adds calculated overtime once and does not create violation deductions in overtime mode", async () => {
    const projectId = "21963b9d-0f5c-4c10-a990-00cb1fc9bda3";
    const userId = "88279b3a-2513-47d6-a85f-540e24262e35";
    const period = {
      id: "50e605a7-ed4d-4986-abeb-e908bad3f560",
      projectId,
      month: "2026-09",
      status: PayrollPeriodStatus.PENDING,
    };
    const salary = {
      userId,
      monthlySalary: "4800.00",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
    };
    const journey = {
      id: "b7062910-d593-4d05-8e80-2e978791cf64",
      projectId,
      date: "2026-09-01",
      is_active: true,
      user: { id: userId },
      shift: { startTime: "09:00:00", endTime: "17:00:00" },
      checkin: {
        checkInTime: new Date("2026-09-01T06:00:00.000Z"),
        checkOutTime: new Date("2026-09-01T15:30:00.000Z"),
      },
    };
    const savedOvertime: PayrollOvertime[] = [];
    const savedViolations: PayrollViolation[] = [];
    let savedLine: PayrollLine | undefined;

    const manager = {
      findOne: jest.fn(async (entity: unknown) => {
        if (entity === PayrollPeriod) return null;
        if (entity === EmployeeSalary) return salary;
        return null;
      }),
      find: jest.fn(async (entity: unknown) => {
        if (entity === Journey) return [journey];
        if (entity === EmployeeSalary) return [salary];
        if (entity === PayrollOvertime) return savedOvertime;
        if (
          entity === PayrollLine ||
          entity === PayrollLineViolation ||
          entity === PayrollAdjustment ||
          entity === PayrollViolation ||
          entity === PayrollViolationRule
        )
          return [];
        return [];
      }),
      create: jest.fn((_entity: unknown, values: object) => values),
      save: jest.fn(async (entityOrValue: unknown, maybeValue?: any) => {
        const entity = maybeValue === undefined ? undefined : entityOrValue;
        const value = maybeValue ?? entityOrValue;
        if (entity === PayrollLine) {
          savedLine = value;
          savedLine!.id = "1b59cab7-31d9-4604-a33f-e6a1c84cb587";
        } else if (entity === PayrollOvertime) {
          const rows = Array.isArray(value) ? value : [value];
          savedOvertime.push(...rows);
        } else if (value?.month === "2026-09") {
          Object.assign(value, period);
        } else if (value?.sourceJourneyId && value?.eventType) {
          savedViolations.push(value);
        }
        return value;
      }),
      remove: jest.fn(async (entityOrValue: unknown, maybeValue?: unknown) => {
        const entity = maybeValue === undefined ? undefined : entityOrValue;
        if (entity === PayrollOvertime) savedOvertime.length = 0;
        return maybeValue ?? entityOrValue;
      }),
      createQueryBuilder: jest.fn(() => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const actor = {
      id: "311b6869-59fd-46bc-953c-0705ab97062d",
      project_id: projectId,
      role: {
        name: ERole.PROJECT_ADMIN,
        hasPermission: () => true,
      },
    };
    const service = new PayrollService(
      { transaction: jest.fn((work) => work(manager)) } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: projectId,
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.OVERTIME,
          payrollCutoffDay: 25,
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const now = new Date("2026-09-14T09:00:00.000Z");
    const result = await service.syncPeriod(
      projectId,
      "2026-09",
      actor as any,
      now,
    );
    await service.syncPeriod(projectId, "2026-09", actor as any, now);

    expect(result.startDate).toBe("2026-08-25");
    expect(result.endDate).toBe("2026-09-24");
    expect(savedOvertime).toHaveLength(1);
    expect(savedOvertime[0]).toMatchObject({
      sourceJourneyId: journey.id,
      scheduledShiftMinutes: 480,
      overtimeMinutes: 90,
      salarySnapshot: "4800.00",
      hourlyRateSnapshot: "20.00",
      amount: "30.00",
    });
    expect(savedViolations).toHaveLength(0);
    expect(savedLine).toMatchObject({
      attendanceDeduction: "0.00",
      automaticOvertimeAddition: "30.00",
      totalAddition: "30.00",
      netPay: "4830.00",
    });
  });

  it("rejects a paid period before mutating overtime or payroll lines", async () => {
    const projectId = "21963b9d-0f5c-4c10-a990-00cb1fc9bda3";
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: "50e605a7-ed4d-4986-abeb-e908bad3f560",
        projectId,
        month: "2026-09",
        status: PayrollPeriodStatus.PAID,
      }),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const service = new PayrollService(
      { transaction: jest.fn((work) => work(manager)) } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: projectId,
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.OVERTIME,
          payrollCutoffDay: 25,
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.syncPeriod(
        projectId,
        "2026-09",
        undefined,
        new Date("2026-09-30T09:00:00.000Z"),
      ),
    ).rejects.toThrow("Paid payroll periods are locked");
    expect(manager.find).not.toHaveBeenCalled();
    expect(manager.create).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.remove).not.toHaveBeenCalled();
  });

  it.each([
    [PayrollPeriodStatus.PENDING, true],
    [PayrollPeriodStatus.PAID, false],
  ])(
    "handles an overtime source already owned by a %s period without moving paid snapshots",
    async (sourcePeriodStatus, shouldRemove) => {
      const projectId = "21963b9d-0f5c-4c10-a990-00cb1fc9bda3";
      const journey = {
        id: "b7062910-d593-4d05-8e80-2e978791cf64",
        projectId,
        date: "2026-09-01",
        is_active: true,
        user: { id: "employee-1" },
        shift: { startTime: "09:00:00", endTime: "17:00:00" },
        checkin: {
          checkInTime: new Date("2026-09-01T06:00:00.000Z"),
          checkOutTime: new Date("2026-09-01T15:30:00.000Z"),
        },
      };
      const sourceSnapshot = {
        id: "source-overtime",
        projectId,
        periodId: "old-period",
        lineId: "old-line",
        sourceJourneyId: journey.id,
        period: { id: "old-period", status: sourcePeriodStatus },
      };
      const oldLine = {
        id: "old-line",
        grossSalary: "4800.00",
        automaticOvertimeAddition: "30.00",
      };
      const manager = {
        findOne: jest.fn(async (entity: unknown, options: any) => {
          // The pessimistic lock for the source period is fetched by id.
          if (entity === PayrollPeriod && options?.where?.id === "old-period")
            return { id: "old-period", status: sourcePeriodStatus };
          // Target period lookup during sync uses month; return null to create new.
          if (entity === PayrollPeriod) return null;
          if (entity === PayrollLine && shouldRemove) return oldLine;
          return null;
        }),
        find: jest.fn(async (entity: unknown, options: any) => {
          if (entity === Journey) return [journey];
          if (entity === PayrollOvertime) {
            return options?.where?.sourceJourneyId ? [sourceSnapshot] : [];
          }
          return [];
        }),
        create: jest.fn((_entity: unknown, values: object) => values),
        save: jest.fn(async (entityOrValue: unknown, value?: any) => {
          const saved = value ?? entityOrValue;
          if (saved?.month) saved.id = "new-period";
          return saved;
        }),
        remove: jest.fn(async (_entity: unknown, value: unknown) => value),
        createQueryBuilder: jest.fn(() => ({
          innerJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        })),
      };
      const service = new PayrollService(
        { transaction: jest.fn((work) => work(manager)) } as any,
        {
          findOne: jest.fn().mockResolvedValue({
            id: projectId,
            payrollEnabled: true,
            payrollCalculationMode: PayrollCalculationMode.OVERTIME,
            payrollCutoffDay: 25,
          }),
        } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await service.syncPeriod(
        projectId,
        "2026-09",
        undefined,
        new Date("2026-09-14T09:00:00.000Z"),
      );

      expect(manager.remove).toHaveBeenCalledTimes(shouldRemove ? 1 : 0);
      if (shouldRemove) {
        expect(manager.remove).toHaveBeenCalledWith(PayrollOvertime, [
          sourceSnapshot,
        ]);
        expect(oldLine.automaticOvertimeAddition).toBe("0.00");
      }
      expect(manager.save).not.toHaveBeenCalledWith(
        PayrollOvertime,
        expect.anything(),
      );
    },
  );

  it("derives each violation event year from its journey in a cross-year cutoff period", async () => {
    const projectId = "21963b9d-0f5c-4c10-a990-00cb1fc9bda3";
    const userId = "88279b3a-2513-47d6-a85f-540e24262e35";
    const salary = {
      userId,
      monthlySalary: "4800.00",
      effectiveFrom: "2025-01-01",
      effectiveTo: null,
    };
    const journeys = ["2025-12-31", "2026-01-01"].map((date, index) => ({
      id: `journey-${index + 1}`,
      projectId,
      date,
      is_active: true,
      user: { id: userId },
      shift: { startTime: "09:00:00", endTime: "17:00:00" },
      checkin: {
        checkInTime: new Date(`${date}T06:10:00.000Z`),
        checkOutTime: new Date(`${date}T14:00:00.000Z`),
      },
    }));
    const rule = Object.assign(new PayrollViolationRule(), {
      ruleKey: "LATE_UP_TO_15_NO_BLOCK",
      version: 1,
      eventType: "late_arrival",
      minimumMinutes: 1,
      maximumMinutes: 15,
      blocksOtherWorkers: false,
      actions: [
        { kind: "warning", value: 0 },
        { kind: "daily_wage_percentage", value: 15 },
        { kind: "daily_wage_percentage", value: 25 },
        { kind: "daily_wage_percentage", value: 50 },
      ],
    });
    const savedViolations: PayrollViolation[] = [];
    let priorYears: unknown;
    const manager = {
      findOne: jest.fn(async (entity: unknown) => {
        if (entity === PayrollPeriod) return null;
        if (entity === EmployeeSalary) return salary;
        return null;
      }),
      find: jest.fn(async (entity: unknown, options: any) => {
        if (entity === Journey) return journeys;
        if (entity === PayrollViolationRule) return [rule];
        if (entity === EmployeeSalary) return [salary];
        if (entity === PayrollViolation && options?.where?.eventYear) {
          priorYears = options.where.eventYear;
          return [];
        }
        return [];
      }),
      create: jest.fn((_entity: unknown, values: object) => values),
      save: jest.fn(async (entityOrValue: unknown, value?: any) => {
        const entity = value === undefined ? undefined : entityOrValue;
        const saved = value ?? entityOrValue;
        if (saved?.month) saved.id = "period-1";
        if (entity === PayrollLine) saved.id = "line-1";
        if (
          entity === PayrollViolation ||
          (saved?.sourceJourneyId && saved?.eventType)
        ) {
          saved.id = `violation-${savedViolations.length + 1}`;
          savedViolations.push(saved);
        }
        return saved;
      }),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const service = new PayrollService(
      { transaction: jest.fn((work) => work(manager)) } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: projectId,
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.VIOLATION,
          payrollCutoffDay: 25,
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.syncPeriod(
      projectId,
      "2026-01",
      undefined,
      new Date("2026-01-10T09:00:00.000Z"),
    );

    expect((priorYears as any)._value).toEqual([2025, 2026]);
    expect(savedViolations.map((item) => item.eventYear)).toEqual([2025, 2026]);
  });

  it("acquires a pessimistic write lock on each source period before removing overtime snapshots", async () => {
    const projectId = "21963b9d-0f5c-4c10-a990-00cb1fc9bda3";
    const journey = {
      id: "b7062910-d593-4d05-8e80-2e978791cf64",
      projectId,
      date: "2026-09-01",
      is_active: true,
      user: { id: "employee-1" },
      shift: { startTime: "09:00:00", endTime: "17:00:00" },
      checkin: {
        checkInTime: new Date("2026-09-01T06:00:00.000Z"),
        checkOutTime: new Date("2026-09-01T15:30:00.000Z"),
      },
    };
    const sourceSnapshot = {
      id: "source-overtime",
      projectId,
      periodId: "old-period",
      lineId: "old-line",
      sourceJourneyId: journey.id,
      period: { id: "old-period", status: PayrollPeriodStatus.PENDING },
    };
    const oldLine = {
      id: "old-line",
      grossSalary: "4800.00",
      automaticOvertimeAddition: "30.00",
    };
    const findOneCalls: Array<{ entity: unknown; options: unknown }> = [];
    const manager = {
      findOne: jest.fn(async (entity: unknown, options: any) => {
        findOneCalls.push({ entity, options });
        if (entity === PayrollPeriod && options?.where?.id === "old-period") {
          // Return the locked source period as still pending.
          return { id: "old-period", status: PayrollPeriodStatus.PENDING };
        }
        if (entity === PayrollPeriod && options?.where?.month) return null;
        if (entity === PayrollLine) return oldLine;
        return null;
      }),
      find: jest.fn(async (entity: unknown, options: any) => {
        if (entity === Journey) return [journey];
        if (entity === PayrollOvertime) {
          return options?.where?.sourceJourneyId ? [sourceSnapshot] : [];
        }
        return [];
      }),
      create: jest.fn((_entity: unknown, values: object) => values),
      save: jest.fn(async (entityOrValue: unknown, value?: any) => {
        const saved = value ?? entityOrValue;
        if ((saved as any)?.month) (saved as any).id = "new-period";
        return saved;
      }),
      remove: jest.fn(async (_entity: unknown, value: unknown) => value),
      createQueryBuilder: jest.fn(() => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const service = new PayrollService(
      { transaction: jest.fn((work) => work(manager)) } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: projectId,
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.OVERTIME,
          payrollCutoffDay: 25,
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.syncPeriod(
      projectId,
      "2026-09",
      undefined,
      new Date("2026-09-14T09:00:00.000Z"),
    );

    // Verify the source period was locked with pessimistic_write.
    const lockCall = findOneCalls.find(
      (call) =>
        call.entity === PayrollPeriod &&
        (call.options as any)?.where?.id === "old-period",
    );
    expect(lockCall).toBeDefined();
    expect((lockCall!.options as any).lock).toEqual({
      mode: "pessimistic_write",
    });
    // Verify the snapshot was removed after the lock confirmed pending status.
    expect(manager.remove).toHaveBeenCalledWith(PayrollOvertime, [
      sourceSnapshot,
    ]);
  });

  it("skips overtime reassignment when a source period is paid by the time the lock is obtained", async () => {
    const projectId = "21963b9d-0f5c-4c10-a990-00cb1fc9bda3";
    const journey = {
      id: "journey-1",
      projectId,
      date: "2026-09-01",
      is_active: true,
      user: { id: "employee-1" },
      shift: { startTime: "09:00:00", endTime: "17:00:00" },
      checkin: {
        checkInTime: new Date("2026-09-01T06:00:00.000Z"),
        checkOutTime: new Date("2026-09-01T15:30:00.000Z"),
      },
    };
    // The snapshot initially looks pending (from the eager load) …
    const sourceSnapshot = {
      id: "source-ot",
      projectId,
      periodId: "old-period",
      lineId: "old-line",
      sourceJourneyId: journey.id,
      period: { id: "old-period", status: PayrollPeriodStatus.PENDING },
    };
    const manager = {
      findOne: jest.fn(async (entity: unknown, options: any) => {
        if (entity === PayrollPeriod && options?.where?.id === "old-period") {
          // … but by the time we acquire the lock it has been paid.
          return { id: "old-period", status: PayrollPeriodStatus.PAID };
        }
        if (entity === PayrollPeriod && options?.where?.month) return null;
        return null;
      }),
      find: jest.fn(async (entity: unknown, options: any) => {
        if (entity === Journey) return [journey];
        if (entity === PayrollOvertime) {
          return options?.where?.sourceJourneyId ? [sourceSnapshot] : [];
        }
        return [];
      }),
      create: jest.fn((_entity: unknown, values: object) => values),
      save: jest.fn(async (entityOrValue: unknown, value?: any) => {
        const saved = value ?? entityOrValue;
        if ((saved as any)?.month) (saved as any).id = "new-period";
        return saved;
      }),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const service = new PayrollService(
      { transaction: jest.fn((work) => work(manager)) } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: projectId,
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.OVERTIME,
          payrollCutoffDay: 25,
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.syncPeriod(
      projectId,
      "2026-09",
      undefined,
      new Date("2026-09-14T09:00:00.000Z"),
    );

    // The source period became paid — no snapshot should be removed or recalculated.
    expect(manager.remove).not.toHaveBeenCalledWith(
      PayrollOvertime,
      expect.anything(),
    );
  });

  it("locks multiple source periods in deterministic sorted order", async () => {
    const projectId = "21963b9d-0f5c-4c10-a990-00cb1fc9bda3";
    const journeys = [
      {
        id: "journey-1",
        projectId,
        date: "2026-09-01",
        is_active: true,
        user: { id: "employee-1" },
        shift: { startTime: "09:00:00", endTime: "17:00:00" },
        checkin: {
          checkInTime: new Date("2026-09-01T06:00:00.000Z"),
          checkOutTime: new Date("2026-09-01T15:30:00.000Z"),
        },
      },
      {
        id: "journey-2",
        projectId,
        date: "2026-09-02",
        is_active: true,
        user: { id: "employee-1" },
        shift: { startTime: "09:00:00", endTime: "17:00:00" },
        checkin: {
          checkInTime: new Date("2026-09-02T06:00:00.000Z"),
          checkOutTime: new Date("2026-09-02T15:30:00.000Z"),
        },
      },
    ];
    // Notice source snapshots are in reverse order: period-z then period-a
    const snapshots = [
      {
        id: "ot-z",
        projectId,
        periodId: "period-z",
        lineId: "line-z",
        sourceJourneyId: "journey-1",
        period: { id: "period-z", status: PayrollPeriodStatus.PENDING },
      },
      {
        id: "ot-a",
        projectId,
        periodId: "period-a",
        lineId: "line-a",
        sourceJourneyId: "journey-2",
        period: { id: "period-a", status: PayrollPeriodStatus.PENDING },
      },
    ];
    const lockedIdsInOrder: string[] = [];
    const manager = {
      findOne: jest.fn(async (entity: unknown, options: any) => {
        if (
          entity === PayrollPeriod &&
          options?.lock?.mode === "pessimistic_write"
        ) {
          if (options?.where?.id) {
            lockedIdsInOrder.push(options.where.id);
            return {
              id: options.where.id,
              status: PayrollPeriodStatus.PENDING,
            };
          }
        }
        if (entity === PayrollPeriod && options?.where?.month) return null;
        if (entity === PayrollLine)
          return { id: options?.where?.id, grossSalary: "4800.00" };
        return null;
      }),
      find: jest.fn(async (entity: unknown, options: any) => {
        if (entity === Journey) return journeys;
        if (entity === PayrollOvertime) return snapshots;
        return [];
      }),
      create: jest.fn((_entity: unknown, values: object) => values),
      save: jest.fn(async (entityOrValue: unknown, value?: any) => {
        const saved = value ?? entityOrValue;
        if ((saved as any)?.month) (saved as any).id = "new-period";
        return saved;
      }),
      remove: jest.fn(async (_entity: unknown, val: unknown) => val),
      createQueryBuilder: jest.fn(() => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const service = new PayrollService(
      { transaction: jest.fn((work) => work(manager)) } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: projectId,
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.OVERTIME,
          payrollCutoffDay: 25,
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.syncPeriod(
      projectId,
      "2026-09",
      undefined,
      new Date("2026-09-14T09:00:00.000Z"),
    );

    // period-a must be locked BEFORE period-z regardless of discovery order
    expect(lockedIdsInOrder).toEqual(["period-a", "period-z"]);
  });

  it("reassigns overtime when cutoff configuration changes from day 1 to day 25", async () => {
    const projectId = "project-cutoff-1-to-25";
    // Journey on Aug 26 was previously in calendar August (2026-08, cutoff 1).
    // With cutoff 25, Aug 26 belongs to September (2026-09, start Aug 25).
    const journey = {
      id: "journey-aug-26",
      projectId,
      date: "2026-08-26",
      is_active: true,
      user: { id: "employee-1" },
      shift: { startTime: "09:00:00", endTime: "17:00:00" },
      checkin: {
        checkInTime: new Date("2026-08-26T06:00:00.000Z"),
        checkOutTime: new Date("2026-08-26T15:30:00.000Z"),
      },
    };
    const oldSnapshot = {
      id: "old-aug-ot",
      projectId,
      periodId: "period-calendar-08",
      lineId: "line-old",
      sourceJourneyId: journey.id,
      amount: "30.00",
      period: { id: "period-calendar-08", status: PayrollPeriodStatus.PENDING },
    };
    const oldLine = {
      id: "line-old",
      grossSalary: "4800.00",
      automaticOvertimeAddition: "30.00",
    };
    const manager = {
      findOne: jest.fn(async (entity: unknown, options: any) => {
        if (
          entity === PayrollPeriod &&
          options?.where?.id === "period-calendar-08"
        ) {
          return {
            id: "period-calendar-08",
            status: PayrollPeriodStatus.PENDING,
          };
        }
        if (entity === PayrollPeriod && options?.where?.month) return null;
        if (entity === PayrollLine && options?.where?.id === "line-old")
          return oldLine;
        return null;
      }),
      find: jest.fn(async (entity: unknown, options: any) => {
        if (entity === Journey) return [journey];
        if (entity === PayrollOvertime) {
          return options?.where?.sourceJourneyId ? [oldSnapshot] : [];
        }
        return [];
      }),
      create: jest.fn((_entity: unknown, values: object) => values),
      save: jest.fn(async (entityOrValue: unknown, value?: any) => {
        const saved = value ?? entityOrValue;
        if ((saved as any)?.month) (saved as any).id = "period-cutoff-09";
        return saved;
      }),
      remove: jest.fn(async (_entity: unknown, val: unknown) => val),
      createQueryBuilder: jest.fn(() => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const service = new PayrollService(
      { transaction: jest.fn((work) => work(manager)) } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: projectId,
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.OVERTIME,
          payrollCutoffDay: 25,
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.syncPeriod(
      projectId,
      "2026-09",
      undefined,
      new Date("2026-09-14T09:00:00.000Z"),
    );

    // Old snapshot from calendar August was removed and line recalculated
    expect(manager.remove).toHaveBeenCalledWith(PayrollOvertime, [oldSnapshot]);
    expect(oldLine.automaticOvertimeAddition).toBe("0.00");
  });

  it("reassigns overtime when cutoff configuration changes from day 25 to day 1", async () => {
    const projectId = "project-cutoff-25-to-1";
    // Journey on Sep 02 was previously in period 2026-09 (Aug 25–Sep 24, cutoff 25).
    // With cutoff 1, Sep 02 belongs to calendar September 2026-09 (Sep 01–Sep 30).
    const journey = {
      id: "journey-sep-02",
      projectId,
      date: "2026-09-02",
      is_active: true,
      user: { id: "employee-1" },
      shift: { startTime: "09:00:00", endTime: "17:00:00" },
      checkin: {
        checkInTime: new Date("2026-09-02T06:00:00.000Z"),
        checkOutTime: new Date("2026-09-02T15:30:00.000Z"),
      },
    };
    const oldSnapshot = {
      id: "old-cutoff-ot",
      projectId,
      periodId: "period-cutoff-25-old",
      lineId: "line-cutoff-old",
      sourceJourneyId: journey.id,
      amount: "30.00",
      period: {
        id: "period-cutoff-25-old",
        status: PayrollPeriodStatus.PENDING,
      },
    };
    const oldLine = {
      id: "line-cutoff-old",
      grossSalary: "4800.00",
      automaticOvertimeAddition: "30.00",
    };
    const manager = {
      findOne: jest.fn(async (entity: unknown, options: any) => {
        if (
          entity === PayrollPeriod &&
          options?.where?.id === "period-cutoff-25-old"
        ) {
          return {
            id: "period-cutoff-25-old",
            status: PayrollPeriodStatus.PENDING,
          };
        }
        if (entity === PayrollPeriod && options?.where?.month) return null;
        if (entity === PayrollLine && options?.where?.id === "line-cutoff-old")
          return oldLine;
        return null;
      }),
      find: jest.fn(async (entity: unknown, options: any) => {
        if (entity === Journey) return [journey];
        if (entity === PayrollOvertime) {
          return options?.where?.sourceJourneyId ? [oldSnapshot] : [];
        }
        return [];
      }),
      create: jest.fn((_entity: unknown, values: object) => values),
      save: jest.fn(async (entityOrValue: unknown, value?: any) => {
        const saved = value ?? entityOrValue;
        if ((saved as any)?.month) (saved as any).id = "period-calendar-new";
        return saved;
      }),
      remove: jest.fn(async (_entity: unknown, val: unknown) => val),
      createQueryBuilder: jest.fn(() => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const service = new PayrollService(
      { transaction: jest.fn((work) => work(manager)) } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: projectId,
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.OVERTIME,
          payrollCutoffDay: 1, // Cutoff changed to day 1
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.syncPeriod(
      projectId,
      "2026-09",
      undefined,
      new Date("2026-09-14T09:00:00.000Z"),
    );

    // Old snapshot from cutoff 25 period was removed and line recalculated
    expect(manager.remove).toHaveBeenCalledWith(PayrollOvertime, [oldSnapshot]);
    expect(oldLine.automaticOvertimeAddition).toBe("0.00");
  });
});
