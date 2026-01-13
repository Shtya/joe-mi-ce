import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Res, UsePipes, ValidationPipe, Req, Headers, BadRequestException } from '@nestjs/common';
import { ExportService, ModuleName } from './export.service';
import * as qs from 'qs';
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

 
  @Get()
  async exportData(
    @Query('module') module: ModuleName,
    @Res() res: Response,
    @Query('limit') limit?: string,
  ) {
    return this.exportService.exportEntityToExcel(
      this.exportService.dataSource, 
      module, 
      res, 
      { 
        exportLimit: limit
      }
    );
  }


  @Get('by-url')
  async exportByUrl(
    @Query() query: any,
    @Res() res: Response,
    @Headers('authorization') authHeader: string,
  ) {
    const { url, fileName, ...allQueryParams } = query;
  
    if (!url) {
      throw new BadRequestException('URL parameter is required');
    }
  
    // Split URL into base path and query string
    const [baseUrl, queryString] = url.split('?');
    
    // Parse existing query parameters from URL
    const existingParams = new URLSearchParams(queryString || '');
    const existingParamsObj: Record<string, string> = {};
    
    existingParams.forEach((value, key) => {
      existingParamsObj[key] = value;
    });
  
    // Filter out export-related parameters and parameters that conflict with path
    const exportParams = [
      'module', 'limit', 'page', 'perPage', 'exportLimit', 'simpleView', 'fileName'
    ];
  
    // Create final params object
    const finalParams: Record<string, any> = {};
    
    // Add existing params (from the URL)
    Object.keys(existingParamsObj).forEach(key => {
      if (!exportParams.includes(key)) {
        finalParams[key] = existingParamsObj[key];
      }
    });
    
    // Add new params (from query), but only if they don't conflict
    Object.keys(allQueryParams).forEach(key => {
      if (!exportParams.includes(key)) {
        // Don't add parameters that might be in the path already
        // Check if this looks like a UUID that might be in the path
        const isUuid = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(allQueryParams[key]);
        const isInPath = isUuid && baseUrl.includes(allQueryParams[key]);
        
        if (!isInPath) {
          finalParams[key] = allQueryParams[key];
        }
      }
    });
  
    // Check if baseUrl already contains branchId or similar UUID in path
    // If it does, remove any branchId parameter from query params
    const uuidInPath = baseUrl.match(/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/);
    if (uuidInPath) {
      // Remove any parameter that matches the UUID in the path
      const pathUuid = uuidInPath[0];
      Object.keys(finalParams).forEach(key => {
        if (finalParams[key] === pathUuid) {
          delete finalParams[key];
        }
      });
    }
  
    // Build the final URL
    const newQueryString = Object.keys(finalParams).length > 0
      ? `?${qs.stringify(finalParams)}`
      : '';
  
    const fullUrl = `${baseUrl}${newQueryString}`;
  
    console.log(`Exporting from URL: ${fullUrl}`);
  
    return this.exportService.exportFromUrlOnly(
      fullUrl, 
      res, 
      fileName, 
      authHeader
    );
  }


}

