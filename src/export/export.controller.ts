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
    @Query() query: any,
    @Res() res: Response,
    @Headers('authorization') authHeader: string,
  ) {
    const { url, fileName, ...filters } = query;

    // Rebuild the URL with its query params
    const fullUrl =
      Object.keys(filters).length > 0
        ? `${url}?${new URLSearchParams(filters).toString()}`
        : url;
  
    return this.exportService.exportFromUrlOnly(fullUrl, res, fileName, authHeader);
  }
}

