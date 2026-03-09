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

  @Cron('0 7 * * *')
  async handleDailyReport() {
    this.logger.log('Starting daily monthly report cron job');

    try {
      const filePath = await this.reportsService.generateMonthlyReport();
      this.logger.log(`Excel report generated successfully at: ${filePath}`);

      const filename = path.basename(filePath);
      const emailSent = await this.mailService.sendReportEmail(filePath, filename);

      if (emailSent) {
        this.logger.log('Daily report email sent successfully.');
      } else {
        this.logger.warn('Daily report generation succeeded, but email sending failed.');
      }
    } catch (error) {
      this.logger.error('Error occurred during daily report cron job execution');
      this.logger.error(error.message);
      if (error.stack) {
        this.logger.error(error.stack);
      }
    }

    this.logger.log('Finished daily monthly report cron job');
  }



  @Cron('0 9 * * *')
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
      const subject = 'Gatemea Report Six Seven'; // "six seven" interpretation
      const emailSent = await this.mailService.sendReportEmail(
        filePath, 
        filename, 
        recipient, 
        subject,
        'Attached is the Gatemea report for yesterday.'
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
