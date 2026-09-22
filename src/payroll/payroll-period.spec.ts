import {
  activePayrollMonth,
  calculateOvertimeAmount,
  resolvePayrollPeriod,
  validatePayrollCutoffDay,
} from "./payroll-period";

describe("payroll period", () => {
  it("uses the requested calendar month for the default day-one cutoff", () => {
    expect(resolvePayrollPeriod("2026-09", 1)).toEqual({
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
  });

  it("ends a cutoff-25 September period on the 24th", () => {
    expect(resolvePayrollPeriod("2026-09", 25)).toEqual({
      startDate: "2026-08-25",
      endDate: "2026-09-24",
    });
  });

  it("clamps cutoff 31 for February in a leap year", () => {
    expect(resolvePayrollPeriod("2028-03", 31)).toEqual({
      startDate: "2028-02-29",
      endDate: "2028-03-30",
    });
  });

  it("assigns a date before the cutoff to the preceding payroll month", () => {
    expect(activePayrollMonth(new Date("2026-09-24T12:00:00.000Z"), 25)).toBe(
      "2026-08",
    );
  });

  it("pays 90 overtime minutes at the scheduled-shift hourly rate", () => {
    expect(
      calculateOvertimeAmount({
        monthlySalary: 4_800,
        scheduledShiftMinutes: 480,
        overtimeMinutes: 90,
      }),
    ).toBe(30);
  });

  it.each([0, 32, 12.5])(
    "rejects an invalid persisted cutoff day of %s",
    (cutoffDay) => {
      expect(() => validatePayrollCutoffDay(cutoffDay)).toThrow(RangeError);
    },
  );
});
