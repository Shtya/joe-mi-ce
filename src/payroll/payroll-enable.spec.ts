import { PayrollService } from "./payroll.service";
import { ERole } from "enums/Role.enum";

describe("PayrollService.enableProjectPayroll", () => {
  const project = { id: "project-1", payrollEnabled: false };
  const manager = {
    findOne: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn((work) => work(manager)),
  };
  const actor = {
    id: "admin-1",
    project_id: "project-1",
    role: {
      name: ERole.PROJECT_ADMIN,
      hasPermission: jest.fn().mockReturnValue(true),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    manager.findOne.mockResolvedValue(project);
    manager.save.mockResolvedValue(project);
    manager.count.mockResolvedValue(1);
    jest.useFakeTimers().setSystemTime(new Date("2026-09-13T09:00:00Z"));
  });

  afterEach(() => jest.useRealTimers());

  it("creates and calculates the current period from the first day when enabled", async () => {
    const service = new PayrollService(
      dataSource as any,
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
    const syncPeriod = jest
      .spyOn(service, "syncPeriod")
      .mockResolvedValue({ periodId: "period-1", month: "2026-09" } as any);

    await service.enableProjectPayroll("project-1", true, actor as any);

    expect(syncPeriod).toHaveBeenCalledWith("project-1", "2026-09", actor);
  });

  it("does not allow a super admin to manage project payroll", async () => {
    const service = new PayrollService(
      dataSource as any,
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
    jest
      .spyOn(service, "syncPeriod")
      .mockResolvedValue({ periodId: "period-1", month: "2026-09" } as any);

    await expect(
      service.enableProjectPayroll("project-1", true, {
        id: "super-1",
        role: { name: ERole.SUPER_ADMIN },
      } as any),
    ).rejects.toThrow("You do not have payroll access for this project");
  });
});
