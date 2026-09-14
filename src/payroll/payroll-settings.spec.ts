import { PayrollService } from "./payroll.service";
import { EPermission } from "enums/Permissions.enum";
import { ERole } from "enums/Role.enum";

describe("PayrollService payroll settings", () => {
  const actor = {
    project_id: "project-1",
    role: {
      name: ERole.PROJECT_ADMIN,
      hasPermission: jest.fn().mockReturnValue(true),
    },
  };

  function createService(project: { id: string; payrollEnabled: boolean }) {
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

  it("returns whether payroll is enabled for the authenticated project", async () => {
    const { service } = createService({
      id: "project-1",
      payrollEnabled: false,
    });

    await expect(
      (service as any).getPayrollSettings("project-1", actor),
    ).resolves.toEqual({ projectId: "project-1", payrollEnabled: false });
    expect(actor.role.hasPermission).toHaveBeenCalledWith(
      EPermission.PAYROLL_READ,
    );
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
