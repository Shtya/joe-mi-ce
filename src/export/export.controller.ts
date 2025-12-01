import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Res, UsePipes, ValidationPipe, Req, Headers } from '@nestjs/common';
import { ExportService, ModuleName } from './export.service';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get()
  async exportData(@Query('module') module: ModuleName, @Res() res: any, @Query('limit') limit?: string) {
    return this.exportService.exportEntityToExcel(this.exportService.dataSource, module, res, { exportLimit: limit });
  }

  @Get('by-url')
  async exportByUrl(
		@Body('url') url: string,
    @Res() res: Response,
    @Query('fileName') fileName?: string,
    @Body('auth') authHeader?: string,
  ) {
		
    return this.exportService.exportFromUrlOnly(url, res, fileName, authHeader);
  }
}

