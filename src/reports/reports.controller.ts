import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { ReportsService } from "./reports.service";
import { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { MailService } from "../mail/mail.service";
import * as path from "path";
import { ReportsCron } from "./reports.cron";
import * as XLSX from "xlsx";

@Controller("reports")
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly mailService: MailService,
    private readonly reportsCron: ReportsCron,
  ) {}

  private parseYesNo(value: any): boolean | undefined {
    if (value === undefined || value === null || value === "") return undefined;

    const normalized = String(value).trim().toLowerCase();
    if (["yes", "true", "1"].includes(normalized)) return true;
    if (["no", "false", "0"].includes(normalized)) return false;

    return undefined;
  }

  private getMonthlyReportOptions(
    query: Record<string, any> = {},
    usernames?: string[],
  ) {
    return {
      overtimeStartDate: query.overtimeStartDate,
      overtimeEndDate: query.overtimeEndDate,
      usernames,
      tabs: {
        attendance: this.parseYesNo(query.attendance),
        mgAttendance: this.parseYesNo(query.mgAttendance),
        sarEntries: this.parseYesNo(query.sarEntries),
        mgSarEntries: this.parseYesNo(query.mgSarEntries),
        checkInOut: this.parseYesNo(query.checkInOut),
        overtime: this.parseYesNo(query.overtime),
        salesByModel: this.parseYesNo(query.salesByModel),
        salesDetail: this.parseYesNo(query.salesDetail),
      },
    };
  }

  private getUploadedExcelFile(
    files:
      | Record<string, Express.Multer.File[]>
      | Express.Multer.File[]
      | undefined,
  ): Express.Multer.File | undefined {
    if (!files) return undefined;
    if (Array.isArray(files)) return files[0];

    return (
      files.file?.[0] ||
      files.users?.[0] ||
      files.usersFile?.[0] ||
      files.excel?.[0]
    );
  }

  private getUsernamesFromExcel(file: Express.Multer.File): string[] {
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    }) as any[][];

    if (rows.length === 0) return [];

    const headers = rows[0].map((cell) =>
      String(cell || "")
        .trim()
        .toLowerCase(),
    );
    const userColumnIndex = Math.max(
      headers.indexOf("user"),
      headers.indexOf("username"),
    );
    let columnIndex = userColumnIndex >= 0 ? userColumnIndex : -1;

    if (columnIndex < 0) {
      const maxColumns = Math.max(...rows.map((row) => row.length));
      let bestColumn = 0;
      let bestCount = 0;

      for (let index = 0; index < maxColumns; index++) {
        const count = rows
          .slice(1)
          .filter((row) => /^AEC-\d+$/i.test(String(row[index] || "").trim()))
          .length;

        if (count > bestCount) {
          bestColumn = index;
          bestCount = count;
        }
      }

      columnIndex = bestColumn;
    }

    return rows
      .slice(1)
      .map((row) => String(row[columnIndex] || "").trim())
      .filter(Boolean);
  }

  private async sendTestMonthlyReportEmail(
    email: string,
    query: Record<string, any>,
    res: Response,
    usernames?: string[],
  ) {
    try {
      const filePath = await this.reportsService.generateMonthlyReport(
        undefined,
        this.getMonthlyReportOptions(query, usernames),
      );
      if (!filePath) {
        return res.status(404).json({
          success: false,
          message: "Report generation failed",
        });
      }
      const filename = path.basename(filePath);
      const subject = "JOE MI CI Monthly Report (Test)";
      const textBody = `Dear Team,\n\nPlease find attached the test JOE MI CI Monthly Performance Report.\n\nBest regards,\nSystem Operations`;
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
    .header { background-color: #1F4E78; color: #ffffff; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 1px; }
    .subheader { font-size: 14px; opacity: 0.8; margin-top: 5px; }
    .content { padding: 30px; color: #333333; line-height: 1.6; }
    .content p { margin: 0 0 15px; }
    .footer { background-color: #f1f1f1; color: #888888; text-align: center; padding: 20px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>JOE MI CI MONTHLY REPORT (TEST)</h1>
      <div class="subheader">System Operations</div>
    </div>
    <div class="content">
      <p>Dear Team,</p>
      <p>Please find attached the <strong>JOE MI CI Monthly Performance Report</strong>. This is a system test email.</p>
      <p>The report is attached to this email as an Excel spreadsheet. Please review the data at your earliest convenience.</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} System Operations. All rights reserved.<br>
      This is an automated test message.
    </div>
  </div>
</body>
</html>`;

      const emailSent = await this.mailService.sendReportEmail(
        filePath,
        filename,
        email,
        subject,
        textBody,
        emailHtml,
      );

      if (emailSent) {
        return res.status(200).json({
          success: true,
          message: `Test monthly report email sent successfully to ${email}`,
          filteredUsers: usernames?.length || 0,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to send test monthly report email. Check server logs.",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error sending test monthly report email",
        error: error.message,
      });
    }
  }

  @Get("trigger-monthly-email")
  async triggerMonthlyEmail(@Res() res: Response) {
    try {
      await this.reportsCron.handleMonthlyReportCron();
      return res.status(200).json({
        success: true,
        message: "Monthly report email trigger initiated",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to trigger monthly report email",
        error: error.message,
      });
    }
  }

  @Get("trigger-gatemea-email")
  async triggerGatemeaEmail(@Res() res: Response) {
    try {
      await this.reportsCron.handleGatemeaReport();
      return res.status(200).json({
        success: true,
        message: "Gatemea report email trigger initiated",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to trigger Gatemea report email",
        error: error.message,
      });
    }
  }

  @Get("trigger-dreame-email")
  async triggerDreameEmail(@Res() res: Response) {
    try {
      await this.reportsCron.handleDreameMonthlyReportCron();
      return res.status(200).json({
        success: true,
        message: "Dreame monthly report email trigger initiated",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to trigger Dreame monthly report email",
        error: error.message,
      });
    }
  }

  @Get("dreame-download")
  async downloadDreameReport(
    @Query("date") date: string,
    @Res() res: Response,
  ) {
    try {
      const filePath = await this.reportsService.generateDreameMonthlyReport(
        date || undefined,
      );
      const fileName = path.basename(filePath);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

      return res.download(filePath, fileName);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to download Dreame monthly report",
        error: error.message,
      });
    }
  }

  @Get("dreame-email/:date/:email")
  async sendDreameReportEmailByDate(
    @Param("date") date: string,
    @Param("email") email: string,
    @Res() res: Response,
  ) {
    try {
      const filePath = await this.reportsService.generateDreameMonthlyReport(date);
      if (!filePath) {
        return res.status(404).json({
          success: false,
          message: "Report generation failed",
        });
      }
      const filename = path.basename(filePath);
      const subject = `Dreame Monthly Performance Report - ${date}`;
      const textBody = `Dear Team,\n\nPlease find attached the Dreame Monthly Performance Report for ${date}.\n\nBest regards,\nSystem Operations`;
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
    .header { background-color: #1F4E78; color: #ffffff; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 1px; }
    .subheader { font-size: 14px; opacity: 0.8; margin-top: 5px; }
    .content { padding: 30px; color: #333333; line-height: 1.6; }
    .content p { margin: 0 0 15px; }
    .footer { background-color: #f1f1f1; color: #888888; text-align: center; padding: 20px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>DREAME MONTHLY REPORT</h1>
      <div class="subheader">System Operations - ${date}</div>
    </div>
    <div class="content">
      <p>Dear Team,</p>
      <p>Please find attached the <strong>Dreame Monthly Performance Report</strong> for the period ending ${date}.</p>
      <p>The report contains the <strong>Sales by Model</strong> and <strong>Sales Detail</strong> sheets, filtered for brand <strong>Dreame</strong> and project <strong>taqnia</strong>.</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} System Operations. All rights reserved.<br>
      This is an automated performance update.
    </div>
  </div>
</body>
</html>`;

      const emailSent = await this.mailService.sendReportEmail(
        filePath,
        filename,
        email,
        subject,
        textBody,
        emailHtml,
      );

      if (emailSent) {
        return res.status(200).json({
          success: true,
          message: `Dreame monthly report email sent successfully to ${email}`,
        });
      } else {
        return res.status(500).json({
          success: false,
          message: "Failed to send Dreame monthly report email. Check server logs.",
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error sending Dreame monthly report email",
        error: error.message,
      });
    }
  }

  @Get("gatemea-email/:date/:email")
  async sendTestGatemeaEmailByDate(
    @Param("date") date: string,
    @Param("email") email: string,
    @Res() res: Response,
  ) {
    try {
      const filePath = await this.reportsService.generateGatemeaReport(date);
      if (!filePath) {
        return res.status(404).json({
          success: false,
          message: "Gatemea project not found or report generation failed",
        });
      }

      const filename = path.basename(filePath);
      const subject = `Gatemea Report Six Seven (Test) - ${date}`;
      const textBody = `Dear Team,\n\nPlease find attached the test Gatemea SixSeven Daily Performance Report for ${date}.\n\nBest regards,\nSystem SixSeven Operations`;
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
    .header { background-color: #1F4E78; color: #ffffff; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 1px; }
    .subheader { font-size: 14px; opacity: 0.8; margin-top: 5px; }
    .content { padding: 30px; color: #333333; line-height: 1.6; }
    .content p { margin: 0 0 15px; }
    .highlights { background-color: #f9fbfd; border-left: 4px solid #1F4E78; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0; }
    .highlights ul { margin: 0; padding-left: 20px; }
    .highlights li { margin-bottom: 8px; }
    .footer { background-color: #f1f1f1; color: #888888; text-align: center; padding: 20px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>GATEMEA DAILY REPORT (TEST)</h1>
      <div class="subheader">System SixSeven Operations - ${date}</div>
    </div>
    <div class="content">
      <p>Dear Team,</p>
      <p>Please find attached the <strong>Gatemea SixSeven Daily Performance Report</strong> for ${date}. This is a system test email.</p>

      <div class="highlights">
        <p><strong>This report includes:</strong></p>
        <ul>
          <li>Sales performance grouped by product and chain</li>
          <li>Daily attendance records for all scheduled personnel</li>
        </ul>
      </div>

      <p>The report is attached to this email as an Excel spreadsheet. Please review the data at your earliest convenience.</p>
      <p>Should you have any questions or require further details, please do not hesitate to reach out to the administrative team.</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} System SixSeven. All rights reserved.<br>
      This is an automated test message.
    </div>
  </div>
</body>
</html>`;

      const emailSent = await this.mailService.sendReportEmail(
        filePath,
        filename,
        email,
        subject,
        textBody,
        emailHtml,
      );

      if (emailSent) {
        return res.status(200).json({
          success: true,
          message: `Test report email sent successfully to ${email} for ${date}`,
        });
      } else {
        return res.status(500).json({
          success: false,
          message: "Failed to send test report email. Check server logs.",
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error sending test report email",
        error: error.message,
      });
    }
  }

  @Get("/:email")
  async sendTestEmailEndpoint(
    @Param("email") email: string,
    @Res() res: Response,
  ) {
    try {
      const filePath = await this.reportsService.generateGatemeaReport();
      if (!filePath) {
        return res.status(404).json({
          success: false,
          message: "Gatemea project not found or report generation failed",
        });
      }
      const filename = path.basename(filePath);
      const subject = "Gatemea Report Six Seven (Test)";
      const textBody = `Dear Team,\n\nPlease find attached the test Gatemea SixSeven Daily Performance Report.\n\nBest regards,\nSystem SixSeven Operations`;
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
    .header { background-color: #1F4E78; color: #ffffff; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 1px; }
    .subheader { font-size: 14px; opacity: 0.8; margin-top: 5px; }
    .content { padding: 30px; color: #333333; line-height: 1.6; }
    .content p { margin: 0 0 15px; }
    .highlights { background-color: #f9fbfd; border-left: 4px solid #1F4E78; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0; }
    .highlights ul { margin: 0; padding-left: 20px; }
    .highlights li { margin-bottom: 8px; }
    .footer { background-color: #f1f1f1; color: #888888; text-align: center; padding: 20px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>GATEMEA DAILY REPORT (TEST)</h1>
      <div class="subheader">System SixSeven Operations</div>
    </div>
    <div class="content">
      <p>Dear Team,</p>
      <p>Please find attached the <strong>Gatemea SixSeven Daily Performance Report</strong> for yesterday. This is a system test email.</p>

      <div class="highlights">
        <p><strong>This report includes:</strong></p>
        <ul>
          <li>Sales performance grouped by product and chain</li>
          <li>Daily attendance records for all scheduled personnel</li>
        </ul>
      </div>

      <p>The report is attached to this email as an Excel spreadsheet. Please review the data at your earliest convenience.</p>
      <p>Should you have any questions or require further details, please do not hesitate to reach out to the administrative team.</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} System SixSeven. All rights reserved.<br>
      This is an automated test message.
    </div>
  </div>
</body>
</html>`;

      const emailSent = await this.mailService.sendReportEmail(
        filePath,
        filename,
        email,
        subject,
        textBody,
        emailHtml,
      );

      if (emailSent) {
        return res.status(200).json({
          success: true,
          message: `Test report email sent successfully to ${email}`,
        });
      } else {
        return res.status(500).json({
          success: false,
          message: "Failed to send test report email. Check server logs.",
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error sending test report email",
        error: error.message,
      });
    }
  }

  @Get("test-monthly-email/:email")
  async sendTestMonthlyEmailEndpoint(
    @Param("email") email: string,
    @Query() query: Record<string, any>,
    @Res() res: Response,
  ) {
    return this.sendTestMonthlyReportEmail(email, query, res);
  }

  @Post("test-monthly-email/:email")
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: "file", maxCount: 1 },
      { name: "users", maxCount: 1 },
      { name: "usersFile", maxCount: 1 },
      { name: "excel", maxCount: 1 },
    ]),
  )
  async postTestMonthlyEmailEndpoint(
    @Param("email") email: string,
    @UploadedFiles() files: Record<string, Express.Multer.File[]>,
    @Query() query: Record<string, any>,
    @Res() res: Response,
  ) {
    const file = this.getUploadedExcelFile(files);
    const usernames = file ? this.getUsernamesFromExcel(file) : undefined;
    return this.sendTestMonthlyReportEmail(email, query, res, usernames);
  }

  @Get("test")
  async testReportGeneration(
    @Query() query: Record<string, any>,
    @Res() res: Response,
  ) {
    try {
      const filePath = await this.reportsService.generateMonthlyReport(
        undefined,
        this.getMonthlyReportOptions(query),
      );
      return res.status(200).json({
        success: true,
        message: "Report generated successfully (test mode)",
        filePath,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate report",
        error: error.message,
      });
    }
  }

  @Get("download")
  async downloadReport(
    @Query() query: Record<string, any>,
    @Res() res: Response,
  ) {
    try {
      const filePath = await this.reportsService.generateMonthlyReport(
        undefined,
        this.getMonthlyReportOptions(query),
      );
      const fileName = path.basename(filePath);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

      return res.download(filePath, fileName);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to download report",
        error: error.message,
      });
    }
  }

  @Get("monthly/:date")
  async downloadMonthlyReportByDate(
    @Param("date") date: string,
    @Query() query: Record<string, any>,
    @Res() res: Response,
  ) {
    try {
      const filePath = await this.reportsService.generateMonthlyReport(
        date,
        this.getMonthlyReportOptions(query),
      );
      if (!filePath) {
        return res.status(404).json({
          success: false,
          message: "Report generation failed",
        });
      }
      const fileName = path.basename(filePath);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

      return res.download(filePath, fileName);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate report for specified date",
        error: error.message,
      });
    }
  }

  @Post("monthly/:date/users-file")
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: "file", maxCount: 1 },
      { name: "users", maxCount: 1 },
      { name: "usersFile", maxCount: 1 },
      { name: "excel", maxCount: 1 },
    ]),
  )
  async downloadMonthlyReportByDateAndUsersFile(
    @Param("date") date: string,
    @UploadedFiles() files: Record<string, Express.Multer.File[]>,
    @Query() query: Record<string, any>,
    @Res() res: Response,
  ) {
    try {
      const file = this.getUploadedExcelFile(files);
      if (!file) {
        return res.status(400).json({
          success: false,
          message: "Excel file is required",
        });
      }

      const usernames = this.getUsernamesFromExcel(file);
      const filePath = await this.reportsService.generateMonthlyReport(
        date,
        this.getMonthlyReportOptions(query, usernames),
      );

      if (!filePath) {
        return res.status(404).json({
          success: false,
          message: "Report generation failed",
        });
      }

      const fileName = path.basename(filePath);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

      return res.download(filePath, fileName);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate report for uploaded users",
        error: error.message,
      });
    }
  }

  @Get("monthly-email/:date/:email")
  async sendMonthlyReportEmailByDate(
    @Param("date") date: string,
    @Param("email") email: string,
    @Query() query: Record<string, any>,
    @Res() res: Response,
  ) {
    try {
      const filePath = await this.reportsService.generateMonthlyReport(
        date,
        this.getMonthlyReportOptions(query),
      );
      if (!filePath) {
        return res.status(404).json({
          success: false,
          message: "Report generation failed",
        });
      }
      const filename = path.basename(filePath);
      const subject = `Monthly Performance Report - ${date}`;
      const textBody = `Dear Team,\n\nPlease find attached the Monthly Performance Report for ${date}.\n\nBest regards,\nSystem Operations`;
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
    .header { background-color: #1F4E78; color: #ffffff; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 1px; }
    .subheader { font-size: 14px; opacity: 0.8; margin-top: 5px; }
    .content { padding: 30px; color: #333333; line-height: 1.6; }
    .content p { margin: 0 0 15px; }
    .footer { background-color: #f1f1f1; color: #888888; text-align: center; padding: 20px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>MONTHLY PERFORMANCE REPORT</h1>
      <div class="subheader">System Operations - ${date}</div>
    </div>
    <div class="content">
      <p>Dear Team,</p>
      <p>Please find attached the <strong>Monthly Performance Report</strong> for the period ending ${date}.</p>
      <p>The report is provided as an Excel spreadsheet containing detailed metrics for attendance and sales performance.</p>
      <p>Should you have any questions, please reach out to the administrative team.</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} System Operations. All rights reserved.<br>
      This is an automated performance update.
    </div>
  </div>
</body>
</html>`;

      const emailSent = await this.mailService.sendReportEmail(
        filePath,
        filename,
        email,
        subject,
        textBody,
        emailHtml,
      );

      if (emailSent) {
        return res.status(200).json({
          success: true,
          message: `Monthly report email sent successfully to ${email}`,
        });
      } else {
        return res.status(500).json({
          success: false,
          message: "Failed to send monthly report email. Check server logs.",
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error sending monthly report email",
        error: error.message,
      });
    }
  }

  @Get("gatemea")
  async downloadGatemeaReport(@Res() res: Response) {
    try {
      const filePath = await this.reportsService.generateGatemeaReport();
      if (!filePath) {
        return res.status(404).json({
          success: false,
          message: "Gatemea project not found or report generation failed",
        });
      }
      const fileName = path.basename(filePath);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

      return res.download(filePath, fileName);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to download Gatemea report",
        error: error.message,
      });
    }
  }
}
