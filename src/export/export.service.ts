// export.service.ts (updated)
import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Branch } from 'entities/branch.entity';
import { Product } from 'entities/products/product.entity';
import { Sale } from 'entities/products/sale.entity';
import { Stock } from 'entities/products/stock.entity';
import { User } from 'entities/user.entity';
import { Shift } from 'entities/employee/shift.entity';
import { Vacation } from 'entities/employee/vacation.entity';
import { Chain } from 'entities/locations/chain.entity';
import { City } from 'entities/locations/city.entity';
import { Country } from 'entities/locations/country.entity';
import { Region } from 'entities/locations/region.entity';
import { Brand } from 'entities/products/brand.entity';
import { Category } from 'entities/products/category.entity';
import { Audit } from 'entities/audit.entity';
import { Competitor } from 'entities/competitor.entity';
import { Permission } from 'entities/permissions.entity';
import { Role } from 'entities/role.entity';
import { SurveyFeedback } from 'entities/survey-feedback.entity';
import { Survey } from 'entities/survey.entity';
import { CheckIn, Journey, JourneyPlan } from 'entities/all_plans.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { IncomingHttpHeaders } from 'http';

export enum ModuleName {
  SALE = 'sale',
  PRODUCT = 'product',
  STOCK = 'stock',
  BRANCH = 'branch',
  USER = 'user',

  CHECKIN = 'checkin',
  JOURNEY = 'journey',
  JOURNEYPLAN = 'journeyplan',
  SHIFT = 'shift',
  VACATION = 'vacation',

  CHAIN = 'chain',
  CITY = 'city',
  COUNTRY = 'country',
  REGION = 'region',

  BRAND = 'brand',
  CATEGORY = 'category',

  AUDIT = 'audit',
  COMPETITOR = 'competitor',

  PERMISSION = 'permission',
  ROLE = 'role',

  SURVEYFEEDBACK = 'surveyfeedback',
  SURVEY = 'survey',
}

export const moduleRepoMap: Record<ModuleName, any> = {
  [ModuleName.SALE]: Sale,
  [ModuleName.PRODUCT]: Product,
  [ModuleName.STOCK]: Stock,
  [ModuleName.BRANCH]: Branch,
  [ModuleName.USER]: User,

  [ModuleName.CHECKIN]: CheckIn,
  [ModuleName.JOURNEY]: Journey,
  [ModuleName.JOURNEYPLAN]: JourneyPlan,
  [ModuleName.SHIFT]: Shift,
  [ModuleName.VACATION]: Vacation,

  [ModuleName.CHAIN]: Chain,
  [ModuleName.CITY]: City,
  [ModuleName.COUNTRY]: Country,
  [ModuleName.REGION]: Region,

  [ModuleName.BRAND]: Brand,
  [ModuleName.CATEGORY]: Category,

  [ModuleName.AUDIT]: Audit,
  [ModuleName.COMPETITOR]: Competitor,

  [ModuleName.PERMISSION]: Permission,
  [ModuleName.ROLE]: Role,

  [ModuleName.SURVEYFEEDBACK]: SurveyFeedback,
  [ModuleName.SURVEY]: Survey,
};

@Injectable()
export class ExportService {
  constructor(
    public readonly dataSource: DataSource,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Flatten nested objects into a single-level object
   * Example: { user: { name: 'John', address: { city: 'NYC' } } } 
   * becomes { 'user.name': 'John', 'user.address.city': 'NYC' }
   */
  private flattenObject(obj: any, prefix: string = '', result: any = {}, excludeKeys: string[] = []): any {
    if (!obj || typeof obj !== 'object') {
      return result;
    }

    for (const key in obj) {
      if (excludeKeys.includes(key)) continue;
      
      const newKey = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // Recursively flatten nested objects
        this.flattenObject(value, newKey, result, excludeKeys);
      } else if (Array.isArray(value)) {
        // Handle arrays - you can choose to join them or handle differently
        result[newKey] = value.join(', ');
      } else if (value instanceof Date) {
        result[newKey] = value.toISOString();
      } else {
        result[newKey] = value;
      }
    }
    
    return result;
  }

  /**
   * Extract all fields from nested objects and create columns
   */
  private extractAllColumnsFromData(data: any[]): { header: string; key: string; width?: number }[] {
    const allColumns = new Set<string>();
    
    data.forEach(item => {
      const flattened = this.flattenObject(item, '', {}, ['updated_at', 'deleted_at']);
      Object.keys(flattened).forEach(key => allColumns.add(key));
    });
    
    return Array.from(allColumns).map(key => ({
      header: this.formatHeader(key),
      key,
      width: 20
    }));
  }

  /**
   * Format header for better readability
   * Example: 'user.address.city' becomes 'User Address City'
   */
  private formatHeader(key: string): string {
    return key
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  /**
   * Flatten an array of objects for Excel export
   */
  private prepareDataForExport(data: any[]): any[] {
    return data.map(item => {
      return this.flattenObject(item, '', {}, ['updated_at', 'deleted_at']);
    });
  }

  async exportEntityToExcel(
    dataSource: DataSource,
    moduleName: string,
    res: any,
    options: {
      exportLimit?: number | string;
      columns?: { header: string; key: string; width?: number }[];
      flattenNestedObjects?: boolean; // New option to control flattening
    } = {},
  ) {
    // ✅ Normalize module
    const normalized = (moduleName || '').toLowerCase().trim() as ModuleName;

    const entityClass = moduleRepoMap[normalized];
    if (!entityClass) {
      const allowed = Object.values(ModuleName);
      throw new BadRequestException({
        message: `Invalid module "${moduleName}". Allowed modules are: ${allowed.join(', ')}`,
        allowedModules: allowed,
      });
    }

    const repository: Repository<any> = dataSource.getRepository(entityClass);

    // ✅ Parse limit
    const rawLimit = options.exportLimit;
    let take: number | undefined;

    if (rawLimit === 'all' || (typeof rawLimit === 'string' && rawLimit.toLowerCase().trim() === 'all')) {
      take = undefined;
    } else if (rawLimit === undefined || rawLimit === null || rawLimit === '') {
      take = 10;
    } else {
      const n = typeof rawLimit === 'number' ? rawLimit : Number(rawLimit);
      take = Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
    }

    // ✅ Fetch data
    const findOptions: any = {};
    if (take !== undefined) findOptions.take = take;
    findOptions.relations = this.getRelationsForEntity(normalized); // Add relations

    const data = await repository.find(findOptions);

    // 🎯 Build Excel file with flattening option
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // Determine if we should flatten nested objects (default: true)
    const shouldFlatten = options.flattenNestedObjects !== false;
    
    let columns: { header: string; key: string; width?: number }[];
    let exportData: any[];

    if (shouldFlatten) {
      // Flatten nested objects
      exportData = this.prepareDataForExport(data);
      columns = options.columns || this.extractAllColumnsFromData(data);
    } else {
      // Original behavior - only first level
      exportData = data.map(item => {
        const { updated_at, deleted_at, ...rest } = item;
        return rest;
      });
      columns = options.columns || 
        (data.length > 0
          ? Object.keys(exportData[0])
              .filter(key => key !== 'updated_at' && key !== 'deleted_at')
              .map(key => ({ header: key, key, width: 20 }))
          : []);
    }

    worksheet.columns = columns;

    exportData.forEach(item => {
      const row = worksheet.addRow(item);
      row.eachCell(cell => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    worksheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    worksheet.columns.forEach(column => {
      let maxLength = 10;
      column.eachCell({ includeEmpty: true }, cell => {
        const cellValue = cell.value ? cell.value.toString() : '';
        if (cellValue.length > maxLength) maxLength = cellValue.length;
      });
      column.width = Math.min(maxLength + 2, 60);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${normalized}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  }

  async exportRowsToExcel(
    res: any,
    rows: any[],
    options: {
      sheetName?: string;
      fileName?: string;
      columns?: { header: string; key: string; width?: number }[];
      flattenNestedObjects?: boolean; // New option
    } = {},
  ) {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(options.sheetName || 'Report');

    // Determine if we should flatten nested objects
    const shouldFlatten = options.flattenNestedObjects !== false;
    
    let exportData: any[];
    let columns: { header: string; key: string; width?: number }[];

    if (shouldFlatten) {
      exportData = this.prepareDataForExport(rows);
      columns = options.columns || this.extractAllColumnsFromData(rows);
    } else {
      exportData = rows;
      columns = options.columns || 
        (rows.length > 0 
          ? Object.keys(rows[0]).map(key => ({ 
              header: this.formatHeader(key), 
              key, 
              width: 20 
            })) 
          : []);
    }

    worksheet.columns = columns;

    exportData.forEach(r => {
      const row = worksheet.addRow(r);
      row.eachCell(cell => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    worksheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    worksheet.columns.forEach(col => {
      let max = 10;
      col.eachCell({ includeEmpty: true }, cell => {
        const v = cell.value ? String(cell.value) : '';
        if (v.length > max) max = v.length;
      });
      col.width = Math.min(max + 2, 60);
    });

    const fileName = (options.fileName || 'out_of_stock') + '.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    await workbook.xlsx.write(res);
    res.end();
  }

  async exportFromUrl(
    url: string, 
    moduleName: string, 
    res: Response, 
    limit?: string,
    options?: {
      flattenNestedObjects?: boolean;
    }
  ) {
    try {
      if (!url) {
        throw new BadRequestException('URL parameter is required');
      }

      const data = await this.fetchDataFromUrl(url);

      return this.exportRowsToExcel(res, data, {
        fileName: moduleName || 'exported_data',
        sheetName: moduleName || 'Data',
        flattenNestedObjects: options?.flattenNestedObjects,
      });
    } catch (error) {
      throw new BadRequestException(`Failed to export data: ${error.message}`);
    }
  }

  async exportFromUrlOnly(
    url: string, 
    res: Response, 
    fileName?: string, 
    authHeader?: any,
    options?: {
      flattenNestedObjects?: boolean;
    }
  ) {
    try {
      if (!url) {
        throw new BadRequestException('URL parameter is required');
      }

      const data = await this.fetchDataFromUrl(url, authHeader);

      return this.exportRowsToExcel(res, data, {
        fileName: fileName || 'exported_data',
        sheetName: 'Data',
        flattenNestedObjects: options?.flattenNestedObjects,
      });
    } catch (error) {
      throw new BadRequestException(`Failed to export data: ${error.message}`);
    }
  }

  private async fetchDataFromUrl(url: string, authorization?: string): Promise<any[]> {
    try {
      const cleanUrl = url.startsWith('/') ? url.substring(1) : url;
      const baseUrl = process.env.MAIN_API_URL || `http://localhost:${process.env.PORT || 3000}`;
      const fullUrl = `${baseUrl}/${cleanUrl}`; 
  
      console.log(`Fetching data from: ${fullUrl}`);
  
      const headers: any = {
        'Content-Type': 'application/json',
      };
  
      if (authorization) {
        headers.Authorization = `${authorization}`;
      }
  
      const response = await firstValueFrom(
        this.httpService.get(fullUrl, { headers })
      );
  
      if (Array.isArray(response.data)) return response.data;
      if (Array.isArray(response.data?.data)) return response.data.data;
      if (response.data?.items) return response.data.items;
  
      return [response.data];
  
    } catch (error) {
      console.error('Error fetching data from URL:', error.response?.data || error.message);
      throw new Error(`Failed to fetch data from ${url}: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Helper method to get relations for each entity type
   * This ensures nested objects are loaded from the database
   */
  private getRelationsForEntity(moduleName: ModuleName): string[] {
    const relationMap: Partial<Record<ModuleName, string[]>> = {
      [ModuleName.SALE]: ['product', 'branch', 'user'],
      [ModuleName.PRODUCT]: ['brand', 'category', 'stocks'],
      [ModuleName.STOCK]: ['product', 'branch'],
      [ModuleName.USER]: ['branch', 'role'],
      [ModuleName.BRANCH]: ['chain', 'city', 'region', 'country'],
      [ModuleName.CHECKIN]: ['branch', 'user'],
      [ModuleName.JOURNEY]: ['branch', 'user'],
      [ModuleName.JOURNEYPLAN]: ['branch', 'user'],
      [ModuleName.SHIFT]: ['user'],
      [ModuleName.VACATION]: ['user'],
      [ModuleName.CHAIN]: ['branches'],
      [ModuleName.CITY]: ['branches', 'region', 'country'],
      [ModuleName.COUNTRY]: ['regions', 'cities', 'branches'],
      [ModuleName.REGION]: ['country', 'cities', 'branches'],
      [ModuleName.BRAND]: ['products'],
      [ModuleName.CATEGORY]: ['products'],
      [ModuleName.ROLE]: ['permissions', 'users'],
      [ModuleName.SURVEYFEEDBACK]: ['survey', 'user', 'branch'],
      [ModuleName.SURVEY]: ['feedbacks', 'branch'],
    };

    return relationMap[moduleName] || [];
  }

  /**
   * Advanced export with custom column mapping
   */
  async exportWithCustomMapping(
    data: any[],
    res: any,
    options: {
      fileName?: string;
      sheetName?: string;
      columnMapping?: Record<string, string>; // Map: objectPath -> displayName
      excludeFields?: string[];
    } = {}
  ) {
    const exportData = data.map(item => {
      const flattened = this.flattenObject(item, '', {}, options.excludeFields || ['updated_at', 'deleted_at']);
      
      // Apply custom column mapping if provided
      if (options.columnMapping) {
        const mapped: any = {};
        Object.keys(flattened).forEach(key => {
          const displayKey = options.columnMapping![key] || key;
          mapped[displayKey] = flattened[key];
        });
        return mapped;
      }
      
      return flattened;
    });

    return this.exportRowsToExcel(res, exportData, {
      fileName: options.fileName || 'custom_export',
      sheetName: options.sheetName || 'Data',
      flattenNestedObjects: false, // Already flattened
    });
  }
}