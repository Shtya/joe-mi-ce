import * as ExcelJS from "exceljs";
import { addPayrollDetailsSheet } from "./payroll-details-sheet";

describe("addPayrollDetailsSheet", () => {
  it("adds one employee row with only the selected day's attendance deductions", () => {
    const workbook = new ExcelJS.Workbook();

    addPayrollDetailsSheet(workbook, "2026-09-14", [
      {
        user: { name: "Amina Saleh", username: "amina" },
        grossSalary: "4500.00",
        totalAddition: "200.00",
        manualDeduction: "50.00",
        netPay: "4350.00",
        violations: [
          { eventDate: "2026-09-14", deductionAmount: "75.00" },
          { eventDate: "2026-09-13", deductionAmount: "25.00" },
        ],
      },
    ]);

    const sheet = workbook.getWorksheet("Payroll Details");
    expect(sheet).toBeDefined();
    expect((sheet!.getRow(1).values as unknown[]).slice(1)).toEqual([
      "Date",
      "Employee",
      "Username",
      "Gross Salary",
      "Additions",
      "Attendance Deduction",
      "Manual Deduction",
      "Net Pay",
    ]);
    expect((sheet!.getRow(2).values as unknown[]).slice(1)).toEqual([
      "2026-09-14",
      "Amina Saleh",
      "amina",
      4500,
      200,
      75,
      50,
      4350,
    ]);
  });
});
