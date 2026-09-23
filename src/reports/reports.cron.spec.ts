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
});
