import { Controller, Get, Res, Injectable } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Response } from 'express';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

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
}
