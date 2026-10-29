import {
  contractPeriod,
  earnedAnnualDays,
  allocateVacationDays,
} from "./vacation-balance.util";

describe("contract anniversary vacation balances", () => {
  it("earns 5.25 days in three months instead of granting 21 immediately", () => {
    expect(earnedAnnualDays("2026-07-01", "2026-10-01")).toBe(5.25);
    expect(earnedAnnualDays("2026-07-01", "2026-07-01")).toBe(0);
  });
  it("continues across December and resets only on the anniversary", () => {
    expect(contractPeriod("2026-07-01", "2027-01-01")).toEqual({
      start: "2026-07-01",
      end: "2027-07-01",
    });
    expect(earnedAnnualDays("2026-07-01", "2027-01-01")).toBe(10.5);
    expect(earnedAnnualDays("2026-07-01", "2027-07-01")).toBe(0);
  });
  it("handles February 29 anniversaries without overflowing into March", () => {
    expect(contractPeriod("2024-02-29", "2025-02-28")).toEqual({
      start: "2025-02-28",
      end: "2026-02-28",
    });
    expect(earnedAnnualDays("2024-02-29", "2025-02-28")).toBe(0);
  });
  it("earns nothing before joining and rejects invalid calendar dates", () => {
    expect(earnedAnnualDays("2026-07-01", "2026-06-01")).toBe(0);
    expect(() => contractPeriod("2026-02-30", "2026-10-01")).toThrow();
  });
  it("uses annual days first and splits fractional days without overspending", () => {
    expect(allocateVacationDays(2, 1.25, 2)).toEqual([
      { annualDays: 1, compensatoryDays: 0 },
      { annualDays: 0.25, compensatoryDays: 0.75 },
    ]);
    expect(() => allocateVacationDays(4, 1.25, 2)).toThrow();
    expect(() => allocateVacationDays(1, 0.9999, 0)).toThrow();
  });
});
