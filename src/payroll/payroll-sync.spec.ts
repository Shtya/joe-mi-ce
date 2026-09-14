import { PayrollService } from "./payroll.service";
import { EmployeeSalary } from "entities/payroll/employee-salary.entity";

describe("PayrollService.syncPeriod", () => {
  it("initializes required payroll totals before saving an automatically created line", async () => {
    const period = { id: "period-1", status: "pending" };
    const manager = {
      findOne: jest.fn().mockResolvedValue(period),
      find: jest.fn((entity) => {
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
      { findOne: jest.fn().mockResolvedValue({ payrollEnabled: true }) } as any,
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
    ).resolves.toMatchObject({ periodId: "period-1" });
  });
});
