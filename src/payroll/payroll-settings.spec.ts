import { PayrollService } from "./payroll.service";
import { EPermission } from "enums/Permissions.enum";
import { ERole } from "enums/Role.enum";
import { PayrollCalculationMode } from "./payroll.types";

describe("PayrollService payroll settings", () => {
  const actor = {
    project_id: "project-1",
    role: {
      name: ERole.PROJECT_ADMIN,
      hasPermission: jest.fn().mockReturnValue(true),
    },
  };

  function createService(project: {
    id: string;
    payrollEnabled: boolean;
    payrollCalculationMode?: PayrollCalculationMode;
    payrollCutoffDay?: number;
  }) {
    const projectRepo = { findOne: jest.fn().mockResolvedValue(project) };
    const periodRepo = { find: jest.fn().mockResolvedValue([]) };
    return {
      projectRepo,
      service: new PayrollService(
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
      ),
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it("returns default violation mode and day-one cutoff", async () => {
    const { service } = createService({
      id: "project-1",
      payrollEnabled: true,
    });

    await expect(
      (service as any).getPayrollSettings("project-1", actor),
    ).resolves.toEqual({
      projectId: "project-1",
      payrollEnabled: true,
      calculationMode: PayrollCalculationMode.VIOLATION,
      cutoffDay: 1,
    });
    expect(actor.role.hasPermission).toHaveBeenCalledWith(
      EPermission.PAYROLL_READ,
    );
  });

  it("rejects cutoff day 32", async () => {
    const { service } = createService({
      id: "project-1",
      payrollEnabled: true,
    });

    await expect(
      (service as any).updatePayrollSettings(
        "project-1",
        { cutoffDay: 32 },
        actor,
      ),
    ).rejects.toThrow("cutoffDay must not be greater than 31");
  });

  it("blocks listing payroll while the project has payroll disabled", async () => {
    const { service } = createService({
      id: "project-1",
      payrollEnabled: false,
    });

    await expect(
      service.listPeriods("project-1", {}, actor as any),
    ).rejects.toThrow("Payroll is not enabled for this project");
  });
});
