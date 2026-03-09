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
      const emailSent = await this.mailService.sendTestEmail(email);
      if (emailSent) {
        return res.status(200).json({
          success: true,
          message: `Test email sent successfully to ${email}`,
        });
      } else {
        return res.status(500).json({
          success: false,
          message: 'Failed to send test email. Check server logs.',
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error sending test email',
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
