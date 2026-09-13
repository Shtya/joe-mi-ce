import { PayrollService } from "./payroll.service";
import { EPermission } from "enums/Permissions.enum";
import { ERole } from "enums/Role.enum";

describe("PayrollService.getPeriodById", () => {
  it("returns a detailed period only from the project administrator's project", async () => {
    const period = { id: "period-1", projectId: "project-1", lines: [] };
    const periodRepo = { findOne: jest.fn().mockResolvedValue(period) };
    const service = new PayrollService(
      {} as any,
      {} as any,
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
      }),
    );
    expect(actor.role.hasPermission).toHaveBeenCalledWith(
      EPermission.PAYROLL_READ,
    );
  });
});
