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

  // @Cron('0 8 * * *')
  // async handleGatemeaReport() {
  //   this.logger.log('Starting Gatemea report cron job');

  //   try {
  //     const filePath = await this.reportsService.generateGatemeaReport();
  //     if (!filePath) {
  //       this.logger.warn('Gatemea report generation skipped or failed.');
  //       return;
  //     }
  //     this.logger.log(`Gatemea report generated successfully at: ${filePath}`);

  //     const filename = path.basename(filePath);
  //     const emailSent = await this.mailService.sendReportEmail(filePath, filename);

  //     if (emailSent) {
  //       this.logger.log('Gatemea report email sent successfully.');
  //     } else {
  //       this.logger.warn('Gatemea report generation succeeded, but email sending failed.');
  //     }
  //   } catch (error) {
  //     this.logger.error('Error occurred during Gatemea report cron job execution');
  //     this.logger.error(error.message);
  //     if (error.stack) {
  //       this.logger.error(error.stack);
  //     }
  //   }

  //   this.logger.log('Finished Gatemea report cron job');
  // }
}
