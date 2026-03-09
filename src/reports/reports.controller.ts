import { Controller, Get, Res, UseGuards, Req, Param } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { MailService } from '../mail/mail.service';
import * as path from 'path';

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly mailService: MailService
  ) {}

  @Get('test-email/:email')
  async sendTestEmailEndpoint(@Param('email') email: string, @Res() res: Response) {
    try {
      const filePath = await this.reportsService.generateGatemeaReport();
      if (!filePath) {
        return res.status(404).json({
          success: false,
          message: 'Gatemea project not found or report generation failed',
        });
      }
      const filename = path.basename(filePath);
      const subject = 'Gatemea Report Six Seven (Test)';
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
        emailHtml
      );

      if (emailSent) {
        return res.status(200).json({
          success: true,
          message: `Test report email sent successfully to ${email}`,
        });
      } else {
        return res.status(500).json({
          success: false,
          message: 'Failed to send test report email. Check server logs.',
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error sending test report email',
        error: error.message,
      });
    }
  }

  @Get('test')
  async testReportGeneration(@Res() res: Response) {
    try {
      const filePath = await this.reportsService.generateMonthlyReport();
      return res.status(200).json({
        success: true,
        message: 'Report generated successfully (test mode)',
        filePath,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate report',
        error: error.message,
      });
    }
  }

  @Get('download')
  async downloadReport(@Res() res: Response) {
    try {
      const filePath = await this.reportsService.generateMonthlyReport();
      const fileName = path.basename(filePath);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      
      return res.download(filePath, fileName);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to download report',
        error: error.message,
      });
    }
  }

  @Get('gatemea')
  async downloadGatemeaReport(@Res() res: Response) {
    try {
      const filePath = await this.reportsService.generateGatemeaReport();
      if (!filePath) {
        return res.status(404).json({
          success: false,
          message: 'Gatemea project not found or report generation failed',
        });
      }
      const fileName = path.basename(filePath);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      
      return res.download(filePath, fileName);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to download Gatemea report',
        error: error.message,
      });
    }
  }
}
