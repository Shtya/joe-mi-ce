import {
  calculateMinutesAfterShift,
  calculatePayrollViolation,
  calculateShiftVariance,
} from "./payroll-calculator";

describe("payroll calculator", () => {
  it("deducts 5% of daily wage for a second late arrival", () => {
    expect(
      calculatePayrollViolation({
        eventType: "late_arrival",
        monthlySalary: 4500,
        minutes: 10,
        blocksOtherWorkers: true,
        annualOccurrence: 2,
      }),
    ).toMatchObject({
      ruleKey: "LATE_UP_TO_15_BLOCKS_OTHERS",
      deductionAmount: 7.5,
      penaltyOccurrence: 2,
    });
  });

  it("caps occurrences at the fourth action", () => {
    expect(
      calculatePayrollViolation({
        eventType: "late_arrival",
        monthlySalary: 3000,
        minutes: 10,
        blocksOtherWorkers: true,
        annualOccurrence: 6,
      })?.penaltyOccurrence,
    ).toBe(4);
  });

  it("adds actual late-time wage where the fourth action requires it", () => {
    expect(
      calculatePayrollViolation({
        eventType: "late_arrival",
        monthlySalary: 3000,
        minutes: 90,
        blocksOtherWorkers: false,
        annualOccurrence: 4,
      })?.deductionAmount,
    ).toBe(318.75);
  });

  it("returns no violation for an approved permission", () => {
    expect(
      calculatePayrollViolation({
        eventType: "early_leave",
        monthlySalary: 3000,
        minutes: 20,
        blocksOtherWorkers: null,
        annualOccurrence: 1,
        hasAcceptedPermission: true,
      }),
    ).toBeNull();
  });

  it("handles shifts crossing midnight", () => {
    expect(
      calculateShiftVariance({
        journeyDate: "2026-09-09",
        shiftStartTime: "21:00:00",
        shiftEndTime: "01:00:00",
        checkInTime: new Date("2026-09-09T18:10:00.000Z"),
        checkOutTime: new Date("2026-09-09T21:45:00.000Z"),
        timezoneOffsetMinutes: 180,
      }),
    ).toEqual({ lateMinutes: 10, earlyLeaveMinutes: 15 });
  });

  it("calculates unauthorized presence after an overnight shift", () => {
    expect(
      calculateMinutesAfterShift({
        journeyDate: "2026-09-09",
        shiftStartTime: "21:00:00",
        shiftEndTime: "01:00:00",
        checkOutTime: new Date("2026-09-09T22:20:00.000Z"),
        timezoneOffsetMinutes: 180,
      }),
    ).toBe(20);
  });
});
