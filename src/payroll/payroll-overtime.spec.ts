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
    expect(result.endDate).toBe("2026-09-14");
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
});
