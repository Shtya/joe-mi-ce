import { PayrollService } from "./payroll.service";
import { EmployeeSalary } from "entities/payroll/employee-salary.entity";
import { Journey } from "entities/all_plans.entity";
import { PayrollPeriod } from "entities/payroll/payroll-period.entity";
import { PayrollCalculationMode } from "./payroll.types";
import { ERole } from "enums/Role.enum";

describe("PayrollService.syncPeriod", () => {
  it("stores full violation-mode boundaries while capping current source processing", async () => {
    const period = { id: "period-1", status: "pending" };
    let journeyRange: unknown;
    const manager = {
      findOne: jest.fn((entity) =>
        Promise.resolve(entity === PayrollPeriod ? period : null),
      ),
      find: jest.fn((entity, options) => {
        if (entity === Journey) journeyRange = options.where.date;
        if (entity === EmployeeSalary)
          return Promise.resolve([
            {
              userId: "employee-1",
              monthlySalary: "4500.00",
              effectiveTo: null,
            },
          ]);
        return Promise.resolve([]);
      }),
      create: jest.fn((_entity, values) => values),
      save: jest.fn((entityOrValue, value) => {
        const saved = value ?? entityOrValue;
        if (saved.periodId && saved.userId) {
          if (saved.totalDeduction === undefined || saved.netPay === undefined)
            throw new Error("Required payroll totals are missing");
          saved.id ??= "line-1";
        }
        return Promise.resolve(saved);
      }),
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
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.VIOLATION,
          payrollCutoffDay: 1,
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
        "project-1",
        "2026-09",
        undefined,
        new Date("2026-09-14T09:00:00Z"),
      ),
    ).resolves.toMatchObject({
      periodId: "period-1",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    expect((journeyRange as any)._value).toEqual(["2026-09-01", "2026-09-14"]);
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        calculationMode: PayrollCalculationMode.VIOLATION,
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      }),
    );
  });

  it("locks an existing period before checking paid-state immutability", async () => {
    const period = { id: "period-1", status: "paid" };
    const manager = { findOne: jest.fn().mockResolvedValue(period) };
    const service = new PayrollService(
      { transaction: jest.fn((work) => work(manager)) } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.VIOLATION,
          payrollCutoffDay: 1,
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
        "project-1",
        "2026-09",
        undefined,
        new Date("2026-09-14T09:00:00Z"),
      ),
    ).rejects.toThrow("Paid payroll periods are locked");
    expect(manager.findOne).toHaveBeenCalledWith(PayrollPeriod, {
      where: { projectId: "project-1", month: "2026-09" },
      lock: { mode: "pessimistic_write" },
    });
  });

  it("rejects a future payroll month before starting a transaction", async () => {
    const transaction = jest.fn();
    const service = new PayrollService(
      { transaction } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.VIOLATION,
          payrollCutoffDay: 1,
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
        "project-1",
        "2026-10",
        undefined,
        new Date("2026-09-14T09:00:00Z"),
      ),
    ).rejects.toThrow("Future payroll months cannot be synchronized");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("creates manual periods with the project's full cutoff boundaries and mode snapshot", async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, values) => values),
      save: jest.fn(async (value) => ({ id: "period-1", ...value })),
    };
    const project = {
      id: "project-1",
      payrollEnabled: true,
      payrollCalculationMode: PayrollCalculationMode.OVERTIME,
      payrollCutoffDay: 25,
    };
    const service = new PayrollService(
      { transaction: jest.fn((work) => work(manager)) } as any,
      { findOne: jest.fn().mockResolvedValue(project) } as any,
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
    const actor = {
      id: "admin-1",
      project_id: "project-1",
      role: { name: ERole.PROJECT_ADMIN, hasPermission: () => true },
    };

    await expect(
      service.createPendingPeriod(
        "project-1",
        { month: "2026-09" },
        actor as any,
      ),
    ).resolves.toMatchObject({
      created: true,
      period: {
        startDate: "2026-08-25",
        endDate: "2026-09-24",
        calculationMode: PayrollCalculationMode.OVERTIME,
      },
    });
  });

  it("assigns salary-triggered period creation by effective date and cutoff", async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, values) => values),
      save: jest.fn(async (_entity, value) => ({ id: "period-1", ...value })),
    };
    const project = {
      id: "project-1",
      payrollEnabled: true,
      payrollCalculationMode: PayrollCalculationMode.OVERTIME,
      payrollCutoffDay: 25,
    };
    const service = new PayrollService(
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
      {} as any,
      {} as any,
    );

    await (service as any).ensurePayrollPeriodForEffectiveDate(
      manager,
      project,
      "2026-09-25",
      "admin-1",
    );

    expect(manager.save).toHaveBeenCalledWith(
      PayrollPeriod,
      expect.objectContaining({
        projectId: "project-1",
        month: "2026-10",
        startDate: "2026-09-25",
        endDate: "2026-10-24",
        calculationMode: PayrollCalculationMode.OVERTIME,
      }),
    );
  });

  it("refreshes an existing pending manual period after cutoff or mode changes", async () => {
    const existing = {
      id: "period-1",
      projectId: "project-1",
      month: "2026-09",
      status: "pending",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      calculationMode: PayrollCalculationMode.VIOLATION,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest.fn(async (value) => value),
    };
    const service = new PayrollService(
      { transaction: jest.fn((work) => work(manager)) } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: "project-1",
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
    const actor = {
      id: "admin-1",
      project_id: "project-1",
      role: { name: ERole.PROJECT_ADMIN, hasPermission: () => true },
    };

    await service.createPendingPeriod(
      "project-1",
      { month: "2026-09" },
      actor as any,
    );

    expect(existing).toMatchObject({
      startDate: "2026-08-25",
      endDate: "2026-09-24",
      calculationMode: PayrollCalculationMode.OVERTIME,
    });
    expect(manager.save).toHaveBeenCalledWith(existing);
  });

  it("schedules each project's active cutoff period instead of the calendar month", async () => {
    const projects = [
      {
        id: "cutoff-project",
        payrollEnabled: true,
        payrollCutoffDay: 25,
      },
      {
        id: "calendar-project",
        payrollEnabled: true,
        payrollCutoffDay: 1,
      },
    ];
    const service = new PayrollService(
      {} as any,
      { find: jest.fn().mockResolvedValue(projects) } as any,
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
    const sync = jest.spyOn(service, "syncPeriod").mockResolvedValue({} as any);

    await service.syncMonthEndForEnabledProjects(
      new Date("2026-09-25T09:00:00.000Z"),
    );

    expect(sync).toHaveBeenNthCalledWith(
      1,
      "cutoff-project",
      "2026-10",
      undefined,
      expect.any(Date),
    );
    expect(sync).toHaveBeenNthCalledWith(
      2,
      "calendar-project",
      "2026-09",
      undefined,
      expect.any(Date),
    );
  });

  it("serializes payment with synchronization by locking the period row", async () => {
    const period = {
      id: "period-1",
      projectId: "project-1",
      status: "pending",
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(period),
      save: jest.fn(async (value) => value),
    };
    const service = new PayrollService(
      { transaction: jest.fn((work) => work(manager)) } as any,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: "project-1", payrollEnabled: true }),
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
    const actor = {
      id: "admin-1",
      project_id: "project-1",
      role: { name: ERole.PROJECT_ADMIN, hasPermission: () => true },
    };

    await service.markPaid("period-1", actor as any);

    expect(manager.findOne).toHaveBeenCalledWith(PayrollPeriod, {
      where: { id: "period-1" },
      lock: { mode: "pessimistic_write" },
    });
  });
});
