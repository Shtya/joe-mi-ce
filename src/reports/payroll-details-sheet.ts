import * as ExcelJS from "exceljs";

type PayrollDetailLine = {
  user?: { name?: string; username?: string };
  grossSalary?: string;
  totalAddition?: string;
  manualDeduction?: string;
  netPay?: string;
  violations?: Array<{ eventDate: string; deductionAmount?: string }>;
};

export function addPayrollDetailsSheet(
  workbook: ExcelJS.Workbook,
  reportDate: string,
  payrollLines: PayrollDetailLine[],
) {
  const payrollSheet = workbook.addWorksheet("Payroll Details");
  payrollSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Employee", key: "employee", width: 28 },
    { header: "Username", key: "username", width: 20 },
    { header: "Gross Salary", key: "grossSalary", width: 16 },
    { header: "Additions", key: "additions", width: 14 },
    {
      header: "Attendance Deduction",
      key: "attendanceDeduction",
      width: 24,
    },
    { header: "Manual Deduction", key: "manualDeduction", width: 20 },
    { header: "Net Pay", key: "netPay", width: 16 },
  ];

  payrollLines
    .slice()
    .sort((first, second) =>
      (first.user?.name || first.user?.username || "").localeCompare(
        second.user?.name || second.user?.username || "",
      ),
    )
    .forEach((line) => {
      const attendanceDeduction = (line.violations || [])
        .filter((violation) => violation.eventDate === reportDate)
        .reduce(
          (total, violation) => total + Number(violation.deductionAmount || 0),
          0,
        );

      payrollSheet.addRow({
        date: reportDate,
        employee: line.user?.name || "-",
        username: line.user?.username || "-",
        grossSalary: Number(line.grossSalary || 0),
        additions: Number(line.totalAddition || 0),
        attendanceDeduction,
        manualDeduction: Number(line.manualDeduction || 0),
        netPay: Number(line.netPay || 0),
      });
    });

  return payrollSheet;
}
