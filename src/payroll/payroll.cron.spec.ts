import { PayrollCron } from "./payroll.cron";

describe("PayrollCron", () => {
  const payrollService = {
    syncMonthEndForEnabledProjects: jest.fn(),
    resetAnnualCounters: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it("synchronizes every pending payroll day", async () => {
    await new PayrollCron(payrollService as any).handleDailyPayrollSync(
      new Date("2026-09-09T20:00:00Z"),
    );
    expect(payrollService.syncMonthEndForEnabledProjects).toHaveBeenCalledTimes(
      1,
    );
  });

  it("delegates annual reset", async () => {
    await new PayrollCron(payrollService as any).handleAnnualViolationReset();
    expect(payrollService.resetAnnualCounters).toHaveBeenCalledTimes(1);
  });
});
