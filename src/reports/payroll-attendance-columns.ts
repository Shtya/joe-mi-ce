type PayrollAttendanceLine = {
  grossSalary?: string;
  totalAddition?: string;
  attendanceDeduction?: string;
  manualDeduction?: string;
  netPay?: string;
};

export function getPayrollAttendanceColumns(
  userId: string,
  payrollLinesByUserId: Map<string, PayrollAttendanceLine>,
) {
  const payrollLine = payrollLinesByUserId.get(userId);

  return {
    gross_salary: Number(payrollLine?.grossSalary || 0),
    additions: Number(payrollLine?.totalAddition || 0),
    attendance_deduction: Number(payrollLine?.attendanceDeduction || 0),
    manual_deduction: Number(payrollLine?.manualDeduction || 0),
    net_pay: Number(payrollLine?.netPay || 0),
  };
}
