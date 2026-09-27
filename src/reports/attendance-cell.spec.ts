import {
  formatAttendanceCell,
  formatVacationCell,
  getDailyAttendanceDeductions,
} from "./attendance-cell";

describe("getDailyAttendanceDeductions", () => {
  it("groups an employee's violation deductions by attendance day", () => {
    const deductions = getDailyAttendanceDeductions(
      "employee-1",
      new Map([
        [
          "employee-1",
          {
            violations: [
              { eventDate: "2026-09-01", deductionAmount: "25.50" },
              { eventDate: "2026-09-01", deductionAmount: "10.00" },
              { eventDate: "2026-09-02", deductionAmount: "50.00" },
            ],
          },
        ],
      ]),
    );

    expect(deductions).toEqual(
      new Map([
        ["2026-09-01", 35.5],
        ["2026-09-02", 50],
      ]),
    );
  });
});

describe("attendance report cells", () => {
  it("shows a daily deduction beside the attendance status", () => {
    expect(formatAttendanceCell(1, 35.5)).toBe("1 (35.50)");
  });

  it("shows the vacation reason in the attendance cell", () => {
    expect(formatVacationCell("Annual leave")).toBe("Vacation (Annual leave)");
  });
});
