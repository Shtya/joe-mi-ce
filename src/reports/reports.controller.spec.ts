import * as ExcelJS from "exceljs";
import { mkdtemp, rm, writeFile } from "fs/promises";
import * as os from "os";
import * as path from "path";
import { ReportsController } from "./reports.controller";
import { PayrollCalculationMode } from "../payroll/payroll.types";
import { createOvertimeTimeSheet } from "../payroll/payroll-timesheet";

describe("ReportsController Gatemea test email", () => {
  it("sends the report with the overtime worksheet through the requested date", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "gatemea-manual-report-test-"),
    );
    try {
      const reportPath = path.join(tempDirectory, "gatemea-report.xlsx");
      const reportWorkbook = new ExcelJS.Workbook();
      reportWorkbook.addWorksheet("SixSeven Report").getCell("A1").value =
        "Daily report";
      await reportWorkbook.xlsx.writeFile(reportPath);

      const timeSheet = await createOvertimeTimeSheet({
        projectId: "gatemea-project",
        period: {
          id: "period-october",
          month: "2026-10",
          startDate: "2026-09-26",
          endDate: "2026-10-25",
        },
        throughDate: "2026-09-27",
        employees: [],
      });
      const reportsService = {
        getGatemeaProject: jest.fn().mockResolvedValue({
          id: "gatemea-project",
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.OVERTIME,
        }),
        generateGatemeaReport: jest.fn().mockResolvedValue(reportPath),
      };
      const mailService = {
        sendEmail: jest.fn().mockResolvedValue(true),
        sendReportEmail: jest.fn(),
      };
      const payrollService = {
        refreshOvertimeTimeSheetThroughDate: jest
          .fn()
          .mockResolvedValue(timeSheet),
      };
      const controller = new ReportsController(
        reportsService as any,
        mailService as any,
        {} as any,
        payrollService as any,
      );
      const response = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await controller.sendTestGatemeaEmailByDate(
        "2026-09-27",
        "test@example.com",
        response as any,
      );

      expect(
        payrollService.refreshOvertimeTimeSheetThroughDate,
      ).toHaveBeenCalledWith("gatemea-project", "2026-09-27");
      expect(mailService.sendReportEmail).not.toHaveBeenCalled();
      const attachment = mailService.sendEmail.mock.calls[0][0].attachments[0];
      const combinedWorkbook = new ExcelJS.Workbook();
      await combinedWorkbook.xlsx.load(attachment.content);
      expect(combinedWorkbook.worksheets.map((sheet) => sheet.name)).toEqual([
        "SixSeven Report",
        "October 26",
      ]);
      expect(response.status).toHaveBeenCalledWith(200);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
