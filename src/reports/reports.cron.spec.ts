import { PayrollCalculationMode } from "../payroll/payroll.types";
import * as ExcelJS from "exceljs";
import { createOvertimeTimeSheet } from "../payroll/payroll-timesheet";
import { appendPayrollTimeSheet } from "./payroll-timesheet-worksheet";
import { ReportsCron } from "./reports.cron";
import { mkdtemp, rm } from "fs/promises";
import * as os from "os";
import * as path from "path";

describe("appendPayrollTimeSheet", () => {
  it("adds the August-style period sheet without Employees_DB and preserves its formatting", async () => {
    const report = new ExcelJS.Workbook();
    report.addWorksheet("Gatemea Daily Report").getCell("A1").value =
      "Daily report";

    const timeSheet = await createOvertimeTimeSheet({
      projectId: "gatemea-project",
      period: {
        id: "period-august",
        month: "2026-08",
        startDate: "2026-07-26",
        endDate: "2026-08-25",
      },
      throughDate: "2026-08-25",
      employees: [
        {
          userId: "employee-1",
          identity: "1234567890",
          name: "Employee One",
          monthlySalary: 3000,
          attendance: [
            { workDate: "2026-07-26", present: true, lateMinutes: 16 },
            { workDate: "2026-07-27", weeklyOff: true },
          ],
          overtime: [],
        },
      ],
    });
    const combined = await appendPayrollTimeSheet(
      Buffer.from(await report.xlsx.writeBuffer()),
      timeSheet,
    );
    const result = new ExcelJS.Workbook();
    await result.xlsx.load(combined);

    expect(result.worksheets.map((sheet) => sheet.name)).toEqual([
      "Gatemea Daily Report",
      "August 26",
    ]);
    expect(
      result.getWorksheet("Gatemea Daily Report")!.getCell("A1").value,
    ).toBe("Daily report");
    const periodSheet = result.getWorksheet("August 26")!;
    expect(periodSheet.getCell("A1").value).toBe("Iqama");
    expect(periodSheet.getCell("M1").value).toEqual(
      new Date("2026-07-26T00:00:00.000Z"),
    );
    expect(periodSheet.getCell("M2").value).toBe("1");
    expect(periodSheet.getCell("M2").fill).toMatchObject({
      fgColor: { argb: "FFDDEBF7" },
    });
    expect(periodSheet.getCell("N2").fill).toMatchObject({
      fgColor: { argb: "FFFFFF00" },
    });
    expect(periodSheet.getCell("A4").value).toBe("فهرس الرموز / Legend");
    expect(periodSheet.getCell("C8").value).toBe(
      "Lateness over 15 minutes (light blue fill)",
    );
  });
});

describe("ReportsCron Gatemea overtime refresh", () => {
  it("adds the August-style overtime worksheet to the Gatemea daily report", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "gatemea-report-test-"),
    );
    try {
      const reportPath = path.join(tempDirectory, "gatemea-daily.xlsx");
      const reportWorkbook = new ExcelJS.Workbook();
      reportWorkbook.addWorksheet("Gatemea Report").getCell("A1").value =
        "Daily sales";
      await reportWorkbook.xlsx.writeFile(reportPath);

      const timeSheet = await createOvertimeTimeSheet({
        projectId: "gatemea-project",
        period: {
          id: "period-august",
          month: "2026-08",
          startDate: "2026-07-26",
          endDate: "2026-08-25",
        },
        throughDate: "2026-08-25",
        employees: [
          {
            userId: "employee-1",
            identity: "1234567890",
            name: "Employee One",
            monthlySalary: 3000,
            attendance: [
              { workDate: "2026-07-26", present: true, lateMinutes: 16 },
              { workDate: "2026-07-27", weeklyOff: true },
            ],
            overtime: [],
          },
        ],
      });
      const reportsService = {
        getGatemeaProject: jest.fn().mockResolvedValue({
          id: "gatemea-project",
          payrollEnabled: true,
          payrollCalculationMode: PayrollCalculationMode.OVERTIME,
        }),
        generateGatemeaReport: jest.fn().mockResolvedValue(reportPath),
      };
      const payrollService = {
        refreshDailyOvertimeTimeSheet: jest.fn().mockResolvedValue(timeSheet),
      };
      const mailService = {
        sendEmail: jest.fn().mockResolvedValue(true),
        sendReportEmail: jest.fn(),
      };
      const cron = new (ReportsCron as any)(
        reportsService as any,
        mailService as any,
        payrollService as any,
      );

      await cron.handleGatemeaReport();

      expect(reportsService.generateGatemeaReport).toHaveBeenCalledTimes(1);
      expect(payrollService.refreshDailyOvertimeTimeSheet).toHaveBeenCalledWith(
        "gatemea-project",
        expect.any(Date),
      );
      const email = mailService.sendEmail.mock.calls[0][0];
      expect(email.attachments).toHaveLength(1);
      expect(email.attachments[0]).toMatchObject({
        filename: "gatemea-daily.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const combinedWorkbook = new ExcelJS.Workbook();
      await combinedWorkbook.xlsx.load(email.attachments[0].content);
      expect(combinedWorkbook.worksheets.map((sheet) => sheet.name)).toEqual([
        "Gatemea Report",
        "August 26",
      ]);
      expect(
        combinedWorkbook.getWorksheet("Gatemea Report")!.getCell("A1").value,
      ).toBe("Daily sales");
      expect(
        combinedWorkbook.getWorksheet("August 26")!.getCell("M2").fill,
      ).toMatchObject({ fgColor: { argb: "FFDDEBF7" } });
      expect(
        combinedWorkbook.getWorksheet("August 26")!.getCell("N2").fill,
      ).toMatchObject({ fgColor: { argb: "FFFFFF00" } });
      expect(
        combinedWorkbook.getWorksheet("August 26")!.getCell("A4").value,
      ).toBe("فهرس الرموز / Legend");
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it.each([
    { payrollEnabled: false, mode: PayrollCalculationMode.OVERTIME },
    { payrollEnabled: true, mode: PayrollCalculationMode.VIOLATION },
  ])(
    "keeps the legacy Gatemea report path when payrollEnabled is $payrollEnabled and mode is $mode",
    async ({ payrollEnabled, mode }) => {
      const reportsService = {
        getGatemeaProject: jest.fn().mockResolvedValue({
          id: "gatemea-project",
          payrollEnabled,
          payrollCalculationMode: mode,
        }),
        generateGatemeaReport: jest
          .fn()
          .mockResolvedValue("/tmp/gatemea-daily.xlsx"),
      };
      const payrollService = {
        refreshDailyOvertimeTimeSheet: jest.fn(),
      };
      const mailService = {
        sendEmail: jest.fn(),
        sendReportEmail: jest.fn().mockResolvedValue(true),
      };
      const cron = new (ReportsCron as any)(
        reportsService as any,
        mailService as any,
        payrollService as any,
      );

      await cron.handleGatemeaReport();

      expect(
        payrollService.refreshDailyOvertimeTimeSheet,
      ).not.toHaveBeenCalled();
      expect(reportsService.generateGatemeaReport).toHaveBeenCalledTimes(1);
      expect(mailService.sendReportEmail).toHaveBeenCalledWith(
        "/tmp/gatemea-daily.xlsx",
        "gatemea-daily.xlsx",
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    },
  );
});
