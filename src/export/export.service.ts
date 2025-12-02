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

// Define valid array handling types
export type ArrayHandlingType = 'expand' | 'join' | 'ignore' | 'count';

@Injectable()
export class ExportService {
  constructor(
    public readonly dataSource: DataSource,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Validate and normalize array handling parameter
   */
  private normalizeArrayHandling(arrayHandling: any): ArrayHandlingType {
    const validTypes: ArrayHandlingType[] = ['expand', 'join', 'ignore', 'count'];
    
    if (typeof arrayHandling === 'string') {
      const normalized = arrayHandling.toLowerCase().trim() as ArrayHandlingType;
      if (validTypes.includes(normalized)) {
        return normalized;
      }
    }
    
    return 'expand'; // default to expand (create new rows)
  }

  /**
   * Extract data from response and handle nested records structure
   */
  private extractDataFromResponse(response: any): any[] {
    // Common pagination fields to remove
    const paginationFields = [
      'current_page', 'per_page', 'last_page', 'total', 'next_page_url',
      'prev_page_url', 'from', 'to', 'path', 'first_page_url', 'last_page_url', 'links'
    ];

    // Check if response has a 'records' property
    if (response && typeof response === 'object') {
      // Check for 'records' array
      if (Array.isArray(response.records)) {
        return response.records;
      }
      
      // Check for 'data' property (common in paginated responses)
      if (Array.isArray(response.data)) {
        return response.data;
      }
      
      // Check if response has an 'items' property
      if (Array.isArray(response.items)) {
        return response.items;
      }
      
      // If it's an array, return it directly
      if (Array.isArray(response)) {
        return response;
      }
      
      // If the object itself is data-like but has pagination fields, remove them
      const isPaginated = paginationFields.some(field => field in response);
      if (isPaginated) {
        const cleanData: any = {};
        Object.keys(response).forEach(key => {
          if (!paginationFields.includes(key)) {
            cleanData[key] = response[key];
          }
        });
        
        // Check for nested data after cleaning
        if (Array.isArray(cleanData.records)) {
          return cleanData.records;
        }
        if (Array.isArray(cleanData.data)) {
          return cleanData.data;
        }
        
        return [cleanData];
      }
      
      // If it's a single object, wrap it in array
      return [response];
    }
    
    return [];
  }

  /**
   * Convert Records 0, Records 1, etc. columns into separate rows
   */
  private convertRecordsColumnsToRows(data: any[]): any[] {
    const allRows: any[] = [];
    
    data.forEach(row => {
      // Find all keys that start with "Records "
      const recordKeys = Object.keys(row).filter(key => 
        key.startsWith('Records ') && key.match(/Records \d+/)
      );
      
      if (recordKeys.length === 0) {
        // No Records columns, add as-is
        allRows.push(row);
        return;
      }
      
      // Extract the record number from each key
      const recordNumbers = [...new Set(
        recordKeys.map(key => {
          const match = key.match(/Records (\d+)/);
          return match ? parseInt(match[1]) : -1;
        }).filter(num => num >= 0)
      )].sort((a, b) => a - b);
      
      // For each record number, create a new row
      recordNumbers.forEach(recordNum => {
        const newRow: any = {};
        
        // Copy all non-record columns
        Object.keys(row).forEach(key => {
          if (!key.startsWith('Records ')) {
            newRow[key] = row[key];
          }
        });
        
        // Extract fields for this specific record
        const recordPrefix = `Records ${recordNum} `;
        Object.keys(row).forEach(key => {
          if (key.startsWith(recordPrefix)) {
            // Remove the "Records X " prefix
            const fieldName = key.substring(recordPrefix.length);
            newRow[fieldName] = row[key];
          }
        });
        
        allRows.push(newRow);
      });
    });
    
    return allRows;
  }

  /**
   * Flatten nested objects into single-level object
   */
  private flattenObject(
    obj: any, 
    prefix: string = '', 
    result: any = {}, 
    options: {
      excludeKeys?: string[];
      skipNullUndefined?: boolean;
      currentLevel?: number;
      maxLevel?: number;
    } = {}
  ): any {
    if (!obj || typeof obj !== 'object') {
      return result;
    }

    const {
      excludeKeys = ['updated_at', 'deleted_at'],
      skipNullUndefined = true,
      currentLevel = 0,
      maxLevel = 3
    } = options;

    // Prevent infinite recursion
    if (currentLevel >= maxLevel) {
      if (typeof obj === 'object' && !Array.isArray(obj) && !(obj instanceof Date)) {
        result[prefix || 'data'] = JSON.stringify(obj);
      }
      return result;
    }

    for (const key in obj) {
      if (excludeKeys.includes(key)) continue;
      
      const newKey = prefix ? `${prefix} ${key}` : key;
      const value = obj[key];
      
      if (skipNullUndefined && (value === null || value === undefined)) {
        continue;
      }
      
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          // Handle arrays
          if (value.length === 0) {
            if (!skipNullUndefined) {
              result[newKey] = '';
            }
          } else {
            // For arrays, we might want to handle them differently
            // For now, join them or create separate records
            result[newKey] = value.map(item => 
              typeof item === 'object' ? JSON.stringify(item) : String(item)
            ).join('; ');
          }
        } else if (value instanceof Date) {
          result[newKey] = value.toISOString();
        } else {
          // Recursively flatten nested objects
          this.flattenObject(value, newKey, result, {
            ...options,
            currentLevel: currentLevel + 1
          });
        }
      } else {
        // Handle primitive values
        result[newKey] = value;
      }
    }
    
    return result;
  }

  /**
   * Extract all columns from data
   */
  private extractColumnsFromData(data: any[]): { header: string; key: string; width?: number }[] {
    if (data.length === 0) return [];

    const allColumns = new Set<string>();
    
    data.forEach(row => {
      Object.keys(row).forEach(key => allColumns.add(key));
    });
    
    return Array.from(allColumns)
      .sort()
      .map(key => ({
        header: this.formatHeader(key),
        key,
        width: 20
      }));
  }

  /**
   * Format header for better readability
   */
  private formatHeader(key: string): string {
    return key
      .split(' ')
      .map(part => {
        // Capitalize each word
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(' ');
  }

  /**
   * Process data for export - main entry point
   */
  async exportRowsToExcel(
    res: any,
    rows: any[],
    options: {
      sheetName?: string;
      fileName?: string;
      columns?: { header: string; key: string; width?: number }[];
      flattenNestedObjects?: boolean;
    } = {},
  ) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(options.sheetName || 'Report');

    const shouldFlatten = options.flattenNestedObjects !== false;
    let exportData: any[];
    let columns: { header: string; key: string; width?: number }[];

    if (shouldFlatten) {
      // First, flatten all nested objects
      exportData = rows.map(item => 
        this.flattenObject(item, '', {}, {
          excludeKeys: ['updated_at', 'deleted_at'],
          skipNullUndefined: true
        })
      );
      
      // Check if we have Records X format and convert to separate rows
      exportData = this.convertRecordsColumnsToRows(exportData);
      
      // Get columns from processed data
      columns = options.columns || this.extractColumnsFromData(exportData);
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

    // Set worksheet columns
    worksheet.columns = columns;

    // Add rows
    exportData.forEach(rowData => {
      const rowValues: any = {};
      
      columns.forEach(col => {
        const value = rowData[col.key];
        // Only set value if it's not null/undefined/empty
        if (value !== null && value !== undefined && value !== '') {
          rowValues[col.key] = value;
        }
      });
      
      const row = worksheet.addRow(rowValues);
      row.eachCell(cell => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    // Format header row
    if (worksheet.getRow(1)) {
      worksheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    }

    // Auto-size columns
    worksheet.columns.forEach(col => {
      let max = col.header?.length || 10;
      if (col.eachCell) {
        col.eachCell({ includeEmpty: true }, cell => {
          const v = cell.value ? String(cell.value) : '';
          if (v.length > max) max = v.length;
        });
      }
      col.width = Math.min(max + 2, 60);
    });

    const fileName = (options.fileName || 'export') + '.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    await workbook.xlsx.write(res);
    res.end();
  }

  async exportFromUrlOnly(
    url: string, 
    res: any, 
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

      const rawData = await this.fetchDataFromUrl(url, authHeader);
      
      // Extract data from response
      const data = this.extractDataFromResponse(rawData);
      
      console.log(`Extracted ${data.length} records for export`);

      return this.exportRowsToExcel(res, data, {
        fileName: fileName || 'exported_data',
        sheetName: 'Data',
        flattenNestedObjects: options?.flattenNestedObjects !== false,
      });
    } catch (error) {
      console.error('Export error:', error);
      throw new BadRequestException(`Failed to export data: ${error.message}`);
    }
  }

  async exportEntityToExcel(
    dataSource: DataSource,
    moduleName: string,
    res: any,
    options: {
      exportLimit?: number | string;
      columns?: { header: string; key: string; width?: number }[];
      flattenNestedObjects?: boolean;
    } = {},
  ) {
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

    const findOptions: any = {};
    if (take !== undefined) findOptions.take = take;
    findOptions.relations = this.getRelationsForEntity(normalized);

    const data = await repository.find(findOptions);

    return this.exportRowsToExcel(res, data, {
      fileName: normalized,
      sheetName: normalized,
      columns: options.columns,
      flattenNestedObjects: options.flattenNestedObjects !== false,
    });
  }

  private async fetchDataFromUrl(url: string, authorization?: string): Promise<any> {
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
  
      // Return the entire response for processing
      return response.data;
  
    } catch (error) {
      console.error('Error fetching data from URL:', error.response?.data || error.message);
      throw new Error(`Failed to fetch data from ${url}: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Helper method to get relations for each entity type
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
}