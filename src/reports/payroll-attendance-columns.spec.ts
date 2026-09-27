import { getPayrollAttendanceColumns } from "./payroll-attendance-columns";

describe("getPayrollAttendanceColumns", () => {
  it("returns the payroll totals for the matching attendance employee", () => {
    const payrollLinesByUserId = new Map([
      [
        "employee-1",
        {
          grossSalary: "4500.00",
          totalAddition: "200.00",
          attendanceDeduction: "75.00",
          manualDeduction: "50.00",
          netPay: "4575.00",
        },
      ],
    ]);

    expect(
      getPayrollAttendanceColumns("employee-1", payrollLinesByUserId),
    ).toEqual({
      gross_salary: 4500,
      additions: 200,
      attendance_deduction: 75,
      manual_deduction: 50,
      net_pay: 4575,
    });
  });

  it("returns zero values when an attendance employee has no payroll line", () => {
    expect(getPayrollAttendanceColumns("employee-2", new Map())).toEqual({
      gross_salary: 0,
      additions: 0,
      attendance_deduction: 0,
      manual_deduction: 0,
      net_pay: 0,
    });
  });
});
