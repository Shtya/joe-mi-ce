import { PayrollService } from "./payroll.service";
import { EPermission } from "enums/Permissions.enum";
import { ERole } from "enums/Role.enum";
import { PayrollCalculationMode } from "./payroll.types";

describe("PayrollService.getPeriodById", () => {
  it("returns a detailed period only from the project administrator's project", async () => {
    const overtime = [{ id: "overtime-1", amount: "30.00" }];
    const period = {
      id: "period-1",
      projectId: "project-1",
      calculationMode: PayrollCalculationMode.OVERTIME,
      lines: [{ id: "line-1", overtime }],
    };
    const projectRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: "project-1", payrollEnabled: true }),
    };
    const periodRepo = { findOne: jest.fn().mockResolvedValue(period) };
    const service = new PayrollService(
      {} as any,
      projectRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      periodRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const actor = {
      project_id: "project-1",
      role: {
        name: ERole.PROJECT_ADMIN,
        hasPermission: jest.fn().mockReturnValue(true),
      },
    };

    await expect(
      (service as any).getPeriodById("project-1", "period-1", actor),
    ).resolves.toBe(period);
    expect(periodRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "period-1", projectId: "project-1" },
        relations: expect.arrayContaining(["lines.overtime"]),
      }),
    );
    expect(period.calculationMode).toBe(PayrollCalculationMode.OVERTIME);
    expect(period.lines[0].overtime).toEqual(overtime);
    expect(actor.role.hasPermission).toHaveBeenCalledWith(
      EPermission.PAYROLL_READ,
    );
  });

  it("includes mode snapshots and itemized overtime in period lists", async () => {
    const periods = [
      {
        id: "period-1",
        projectId: "project-1",
        calculationMode: PayrollCalculationMode.OVERTIME,
        lines: [
          {
            id: "line-1",
            userId: "user-1",
            adjustments: [],
            violations: [],
            overtime: [{ id: "overtime-1", amount: "30.00" }],
          },
        ],
      },
    ];
    const periodRepo = { find: jest.fn().mockResolvedValue(periods) };
    const service = new PayrollService(
      {} as any,
      {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: "project-1", payrollEnabled: true }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      periodRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const actor = {
      project_id: "project-1",
      role: {
        name: ERole.PROJECT_ADMIN,
        hasPermission: jest.fn().mockReturnValue(true),
      },
    };

    await expect(
      service.listPeriods("project-1", {}, actor as any),
    ).resolves.toEqual({ items: periods, total: 1 });
    expect(periodRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: expect.arrayContaining(["lines.overtime"]),
      }),
    );
  });
});
