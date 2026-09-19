import * as fs from "fs/promises";
import * as ExcelJS from "exceljs";
import { ReportsService } from "./reports.service";

describe("ReportsService Gatemea payroll details", () => {
  it("includes payroll totals and the daily attendance deduction", async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const project = { id: "gatemea-project", chains: [] };
    const payrollPeriod = {
      month: "2026-09",
      lines: [
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
      ],
    };
    const service = new (ReportsService as any)(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { findOne: jest.fn().mockResolvedValue(project) } as any,
      { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as any,
      { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { findOne: jest.fn().mockResolvedValue(payrollPeriod) } as any,
    );

    const filePath = await service.generateGatemeaReport(
      "2026-09-15T09:00:00+03:00",
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const payrollSheet = workbook.getWorksheet("Payroll Details");
    expect(payrollSheet).toBeDefined();
    expect((payrollSheet!.getRow(1).values as unknown[]).slice(1)).toEqual([
      "Date",
      "Employee",
      "Username",
      "Gross Salary",
      "Additions",
      "Attendance Deduction",
      "Manual Deduction",
      "Net Pay",
    ]);
    expect((payrollSheet!.getRow(2).values as unknown[]).slice(1)).toEqual([
      "2026-09-14",
      "Amina Saleh",
      "amina",
      4500,
      200,
      75,
      50,
      4350,
    ]);

    await fs.unlink(filePath);
  });
});
