import { vacationBalanceType } from "./vacation-balance-type";

describe("vacation types select the balance to deduct", () => {
  it.each([
    "weekend_vacation",
    "weekly_leave",
    "sick_leave",
    "sick leave",
    "Sick Leave",
    "permission_or_absence",
  ])("does not charge either balance for %s", (reason) => {
    expect(vacationBalanceType(reason)).toBe("none");
  });
  it("uses only the annual balance for annual leave", () => {
    expect(vacationBalanceType("annual_leave")).toBe("annual");
  });
  it("uses only compensatory credits for compensatory leave", () => {
    expect(vacationBalanceType("compensatory_leave")).toBe("compensatory");
  });
  it("preserves the annual default for older free-text clients", () => {
    expect(vacationBalanceType("Integration leave")).toBe("annual");
  });
});
