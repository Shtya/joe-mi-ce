import { PayrollCalculationMode } from "../payroll/payroll.types";
import { ReportsCron } from "./reports.cron";

describe("ReportsCron Gatemea overtime refresh", () => {
  it("refreshes Gatemea's full active-period overtime time sheet once per daily run", async () => {
    const reportsService = {
      getGatemeaProject: jest.fn().mockResolvedValue({
        id: "gatemea-project",
        payrollEnabled: true,
        payrollCalculationMode: PayrollCalculationMode.OVERTIME,
      }),
      generateGatemeaReport: jest
        .fn()
        .mockRejectedValue(
          new Error("overtime reports should use the time sheet workbook"),
        ),
    };
    const payrollService = {
      refreshDailyOvertimeTimeSheet: jest
        .fn()
        .mockResolvedValue(Buffer.alloc(0)),
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

    expect(payrollService.refreshDailyOvertimeTimeSheet).toHaveBeenCalledWith(
      "gatemea-project",
      expect.any(Date),
    );
    expect(mailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            content: expect.any(Buffer),
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        ],
      }),
    );
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
