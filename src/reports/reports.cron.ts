import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportsService } from './reports.service';
import { MailService } from '../mail/mail.service';
import * as path from 'path';

@Injectable()
export class ReportsCron {
  private readonly logger = new Logger(ReportsCron.name);

  constructor(
    private readonly reportsService: ReportsService,
    private readonly mailService: MailService,
  ) {}

  @Cron('0 9 * * *', { timeZone: 'Asia/Riyadh' })
  async handleMonthlyReportCron() {
    this.logger.log('Starting JOE MI CI monthly report cron job');

    try {
      const filePath = await this.reportsService.generateMonthlyReport();
      if (!filePath) {
         this.logger.warn('JOE MI CI report generation skipped or failed.');
         return;
      }
      this.logger.log(`Excel report generated successfully at: ${filePath}`);

      const filename = path.basename(filePath);
      const subject = 'JOE MI CI Monthly Report';
      const toRecipient = 'mamro@joe13th.com';
      const ccRecipients = '"Abdulrahman Abdullah" <a.doma@AECKSA.COM>, "Mohammed Abdu Alhaj" <MAlhaj@aecksa.com>, "Riyad Abdullah Ali Alzahrani" <r.alzahrani@AECKSA.COM>';
      const textBody = `Dear Team,\n\nPlease find attached the JOE MI CI Monthly Performance Report up to yesterday.\n\nBest regards,\nSystem Operations`;
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
      <h1>JOE MI CI MONTHLY REPORT</h1>
      <div class="subheader">System Operations</div>
    </div>
    <div class="content">
      <p>Dear Team,</p>
      <p>Please find attached the <strong>JOE MI CI Monthly Performance Report</strong> for the current month up to yesterday.</p>
      <p>The report is attached to this email as an Excel spreadsheet.</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} System Operations. All rights reserved.<br>
      This is an automated message.
    </div>
  </div>
</body>
</html>`;

      const emailSent = await this.mailService.sendReportEmail(filePath, filename, toRecipient, subject, textBody, emailHtml, ccRecipients);

      if (emailSent) {
        this.logger.log('JOE MI CI report email sent successfully.');
      } else {
        this.logger.warn('JOE MI CI report generation succeeded, but email sending failed.');
      }
    } catch (error) {
      this.logger.error('Error occurred during JOE MI CI report cron job execution');
      this.logger.error(error.message);
      if (error.stack) {
        this.logger.error(error.stack);
      }
    }

    this.logger.log('Finished JOE MI CI monthly report cron job');
  }



  @Cron('0 9 * * *', { timeZone: 'Asia/Riyadh' })
  async handleGatemeaReport() {
    this.logger.log('Starting Gatemea report cron job (Daily Yesterday)');

    try {
      const filePath = await this.reportsService.generateGatemeaReport();
      if (!filePath) {
        this.logger.warn('Gatemea report generation skipped or failed.');
        return;
      }
      this.logger.log(`Gatemea report generated successfully at: ${filePath}`);

      const filename = path.basename(filePath);
      const recipient = 'abdullah.almeri@gatemea.com';
      const subject = 'Gatemea Report Six Seven';
      const ccRecipients = 'mohamad.hamze@gatemea.com, Oussama.Barakat@gatemea.com';

      const textBody = `Dear Team,\n\nPlease find attached the Gatemea SixSeven Daily Performance Report for yesterday.\n\nBest regards,\nSystem SixSeven Operations`;
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
      <h1>GATEMEA DAILY REPORT</h1>
      <div class="subheader">System SixSeven Operations</div>
    </div>
    <div class="content">
      <p>Dear Team,</p>
      <p>Please find attached the <strong>Gatemea SixSeven Daily Performance Report</strong> for yesterday.</p>
      
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
      This is an automated message. Please do not reply directly to this email.
    </div>
  </div>
</body>
</html>`;

      const emailSent = await this.mailService.sendReportEmail(
        filePath, 
        filename, 
        recipient, 
        subject,
        textBody,
        emailHtml,
        ccRecipients,
      );

      if (emailSent) {
        this.logger.log(`Gatemea report email sent successfully to ${recipient}.`);
      } else {
        this.logger.warn(`Gatemea report generation succeeded, but email sending to ${recipient} failed.`);
      }
    } catch (error) {
      this.logger.error('Error occurred during Gatemea report cron job execution');
      this.logger.error(error.message);
      if (error.stack) {
        this.logger.error(error.stack);
      }
    }

    this.logger.log('Finished Gatemea report cron job');
  }
}
