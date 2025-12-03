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

@Injectable()
export class ExportService {
  constructor(
    public readonly dataSource: DataSource,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Extract main entity name from URL
   * Example: /api/v1/products -> "products"
   * Example: /api/v1/users?search=john -> "users"
   */
  private extractMainEntityFromUrl(url: string): string {
    try {
      // Remove query parameters
      const urlWithoutQuery = url.split('?')[0];
      
      // Split by slashes
      const parts = urlWithoutQuery.split('/');
      
      // Find the last non-empty part (usually the entity name)
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i] && parts[i].trim() !== '') {
          // Remove any file extensions or version prefixes
          let entity = parts[i].toLowerCase();
          
          // Remove common suffixes
          entity = entity.replace(/\.(json|xml|csv)$/, '');
          
          // Singularize if needed (optional)
          return entity;
        }
      }
      
      return 'data';
    } catch (error) {
      console.error('Error extracting entity from URL:', error);
      return 'data';
    }
  }

  /**
   * Extract data from response
   */
  private extractDataFromResponse(response: any): any[] {
    const paginationFields = [
      'current_page', 'per_page', 'last_page', 'total', 'next_page_url',
      'prev_page_url', 'from', 'to', 'path', 'first_page_url', 'last_page_url', 'links'
    ];

    if (response && typeof response === 'object') {
      if (Array.isArray(response.records)) {
        return response.records;
      }
      
      if (Array.isArray(response.data)) {
        return response.data;
      }
      
      if (Array.isArray(response.items)) {
        return response.items;
      }
      
      if (Array.isArray(response)) {
        return response;
      }
      
      const isPaginated = paginationFields.some(field => field in response);
      if (isPaginated) {
        const cleanData: any = {};
        Object.keys(response).forEach(key => {
          if (!paginationFields.includes(key)) {
            cleanData[key] = response[key];
          }
        });
        
        if (Array.isArray(cleanData.records)) {
          return cleanData.records;
        }
        if (Array.isArray(cleanData.data)) {
          return cleanData.data;
        }
        
        return [cleanData];
      }
      
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
      const recordKeys = Object.keys(row).filter(key => 
        key.startsWith('Records ') && key.match(/Records \d+/)
      );
      
      if (recordKeys.length === 0) {
        allRows.push(row);
        return;
      }
      
      const recordNumbers = [...new Set(
        recordKeys.map(key => {
          const match = key.match(/Records (\d+)/);
          return match ? parseInt(match[1]) : -1;
        }).filter(num => num >= 0)
      )].sort((a, b) => a - b);
      
      recordNumbers.forEach(recordNum => {
        const newRow: any = {};
        
        Object.keys(row).forEach(key => {
          if (!key.startsWith('Records ')) {
            newRow[key] = row[key];
          }
        });
        
        const recordPrefix = `Records ${recordNum} `;
        Object.keys(row).forEach(key => {
          if (key.startsWith(recordPrefix)) {
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
   * Flatten object with entity-aware prefixes
   */
  private flattenObjectWithEntityPrefixes(
    obj: any,
    mainEntity: string = '',
    currentEntity: string = '',
    result: any = {},
    visited: Set<any> = new Set()
  ): any {
    if (!obj || typeof obj !== 'object' || visited.has(obj)) {
      return result;
    }

    visited.add(obj);

    const excludeFields = [
      'id', '_id', 'created_at', 'createdAt', 'updated_at', 'updatedAt',
      'deleted_at', 'deletedAt', '__v', '__version', 'password', 'token'
    ];

    for (const key in obj) {
      if (excludeFields.includes(key.toLowerCase()) || 
          key.toLowerCase().includes('id') ||
          key.toLowerCase().includes('created') ||
          key.toLowerCase().includes('updated') ||
          key.toLowerCase().includes('deleted')) {
        continue;
      }

      const value = obj[key];
      
      if (value === null || value === undefined || value === '') {
        continue;
      }

      // Determine entity prefix
      let entityPrefix = currentEntity;
      const keyLower = key.toLowerCase();
      
      // Common entity names
      const entityNames = ['product', 'brand', 'category', 'project', 'user', 'branch', 'stock', 'sale', 'order'];
      
      if (entityNames.includes(keyLower)) {
        // This key is an entity object
        entityPrefix = key;
      } else if (!entityPrefix && mainEntity) {
        // Use main entity as prefix for root-level fields
        entityPrefix = mainEntity;
      }

      const fullKey = entityPrefix ? `${entityPrefix} ${key}` : key;

      if (Array.isArray(value)) {
        if (value.length > 0) {
          if (typeof value[0] === 'object') {
            // Handle array of objects
            const itemPrefix = key.endsWith('s') ? key.slice(0, -1) : key;
            if (entityNames.includes(itemPrefix.toLowerCase())) {
              this.flattenObjectWithEntityPrefixes(value[0], mainEntity, itemPrefix, result, visited);
            } else {
              result[fullKey] = value.map(item => 
                typeof item === 'object' ? JSON.stringify(item) : String(item)
              ).join('; ');
            }
          } else {
            result[fullKey] = value.join(', ');
          }
        }
      } else if (value instanceof Date) {
        continue;
      } else if (typeof value === 'object') {
        // Recursively flatten nested objects
        const nestedPrefix = entityNames.includes(keyLower) ? key : entityPrefix;
        this.flattenObjectWithEntityPrefixes(value, mainEntity, nestedPrefix, result, visited);
      } else {
        result[fullKey] = value;
      }
    }

    visited.delete(obj);
    return result;
  }

  /**
   * Clean and organize data with main entity first
   */
  private cleanDataForExport(data: any[], mainEntity: string): any[] {
    return data.map(item => {
      return this.flattenObjectWithEntityPrefixes(item, mainEntity);
    });
  }

  /**
   * Group columns with main entity first
   */
  private groupColumnsByEntity(data: any[], mainEntity: string): { header: string; key: string; width?: number; entity?: string }[] {
    if (data.length === 0) return [];

    const allColumns = new Set<string>();
    
    data.forEach(row => {
      Object.keys(row).forEach(key => allColumns.add(key));
    });

    // Group columns by entity
    const columnsByEntity = new Map<string, { key: string; displayName: string }[]>();
    
    allColumns.forEach(key => {
      // Extract entity from key
      const parts = key.split(' ');
      let entity = '';
      let fieldName = key;
      
      if (parts.length > 1) {
        const firstPart = parts[0].toLowerCase();
        const commonEntities = ['product', 'brand', 'category', 'project', 'user', 'branch', 'stock', 'sale'];
        
        if (commonEntities.includes(firstPart)) {
          entity = parts[0];
          fieldName = parts.slice(1).join(' ');
        } else {
          // If no known entity, assume it's part of the main entity
          entity = mainEntity;
          fieldName = key;
        }
      } else {
        // Single word columns belong to main entity
        entity = mainEntity;
      }
      
      if (!columnsByEntity.has(entity)) {
        columnsByEntity.set(entity, []);
      }
      
      // Format display name
      let displayName = fieldName;
      if (fieldName !== key) {
        // Capitalize each word
        displayName = fieldName.split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
      } else {
        displayName = key.charAt(0).toUpperCase() + key.slice(1);
      }
      
      columnsByEntity.get(entity)!.push({ key, displayName });
    });

    // Sort entities: main entity first, then others alphabetically
    const allEntities = Array.from(columnsByEntity.keys());
    const sortedEntities = allEntities.sort((a, b) => {
      if (a === mainEntity) return -1;
      if (b === mainEntity) return 1;
      return a.localeCompare(b);
    });

    const columns: { header: string; key: string; width?: number; entity?: string }[] = [];
    
    sortedEntities.forEach(entity => {
      const entityColumns = columnsByEntity.get(entity)!;
      
      // Sort columns within each entity
      entityColumns.sort((a, b) => {
        const aName = a.displayName.toLowerCase().includes('name') || a.displayName.toLowerCase().includes('title');
        const bName = b.displayName.toLowerCase().includes('name') || b.displayName.toLowerCase().includes('title');
        if (aName && !bName) return -1;
        if (!aName && bName) return 1;
        
        const aDesc = a.displayName.toLowerCase().includes('description');
        const bDesc = b.displayName.toLowerCase().includes('description');
        if (aDesc && !bDesc) return -1;
        if (!aDesc && bDesc) return 1;
        
        return a.displayName.localeCompare(b.displayName);
      });
      
      // Add columns for this entity
      entityColumns.forEach(({ key, displayName }) => {
        const header = entity === mainEntity ? displayName : `${entity.charAt(0).toUpperCase() + entity.slice(1)} ${displayName}`;
        
        columns.push({
          header: header,
          key: key,
          width: this.calculateColumnWidth(key),
          entity: entity
        });
      });
    });

    return columns;
  }

  /**
   * Calculate column width
   */
  private calculateColumnWidth(key: string): number {
    const baseWidth = 15;
    const length = key.length;
    
    if (key.toLowerCase().includes('description') || key.toLowerCase().includes('details')) {
      return Math.max(baseWidth, Math.min(length + 5, 50));
    }
    if (key.toLowerCase().includes('name') || key.toLowerCase().includes('title')) {
      return Math.max(baseWidth, Math.min(length + 3, 30));
    }
    if (key.toLowerCase().includes('email')) {
      return 25;
    }
    if (key.toLowerCase().includes('address')) {
      return 30;
    }
    if (key.toLowerCase().includes('url') || key.toLowerCase().includes('image')) {
      return 30;
    }
    
    return Math.max(baseWidth, Math.min(length + 2, 25));
  }

  /**
   * Process and export data to Excel with main entity first
   */
  async exportRowsToExcel(
    res: any,
    rows: any[],
    mainEntity: string,
    options: {
      sheetName?: string;
      fileName?: string;
    } = {},
  ) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(options.sheetName || 'Report');

    // Clean and process data
    const cleanedData = this.cleanDataForExport(rows, mainEntity);
    const finalData = this.convertRecordsColumnsToRows(cleanedData);
    
    // Get grouped columns with main entity first
    const groupedColumns = this.groupColumnsByEntity(finalData, mainEntity);
    
    // Create worksheet columns
    const worksheetColumns = groupedColumns.map(col => ({
      header: col.header,
      key: col.key,
      width: col.width
    }));

    worksheet.columns = worksheetColumns;

    // Add data rows
    finalData.forEach(rowData => {
      const rowValues: any = {};
      
      worksheetColumns.forEach(col => {
        const value = rowData[col.key];
        if (value !== null && value !== undefined && value !== '') {
          rowValues[col.key] = value;
        }
      });
      
      if (Object.keys(rowValues).length > 0) {
        const row = worksheet.addRow(rowValues);
        row.eachCell(cell => {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
      }
    });

    // Format header row
    if (worksheet.rowCount > 0) {
      const headerRow = worksheet.getRow(1);
      
      // Track current column for entity grouping
      let currentCol = 1;
      let currentEntity = '';
      let entityStartCol = 1;
      
      groupedColumns.forEach((col, index) => {
        const cell = headerRow.getCell(currentCol);
        
        // Apply entity-specific styling
        if (col.entity && col.entity !== currentEntity) {
          // Close previous entity group if exists
          if (currentEntity && currentCol > entityStartCol) {
            // Apply background color to previous entity group
            for (let i = entityStartCol; i < currentCol; i++) {
              const prevCell = headerRow.getCell(i);
              const color = this.getEntityColor(currentEntity);
              prevCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
            }
          }
          
          // Start new entity group
          currentEntity = col.entity!;
          entityStartCol = currentCol;
        }
        
        cell.value = col.header;
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        
        currentCol++;
      });
      
      // Apply color to last entity group
      if (currentEntity && currentCol > entityStartCol) {
        for (let i = entityStartCol; i < currentCol; i++) {
          const prevCell = headerRow.getCell(i);
          const color = this.getEntityColor(currentEntity);
          prevCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        }
      }
    }

    // Auto-size columns
    worksheet.columns.forEach(col => {
      let max = col.header?.toString().length || 10;
      if (col.eachCell) {
        col.eachCell({ includeEmpty: true }, cell => {
          const v = cell.value ? String(cell.value) : '';
          if (v.length > max) max = v.length;
        });
      }
      col.width = Math.min(max + 2, col.width || 60);
    });

    // Freeze header row
    worksheet.views = [
      { state: 'frozen', xSplit: 0, ySplit: 1 }
    ];

    const fileName = (options.fileName || mainEntity || 'export') + '.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    await workbook.xlsx.write(res);
    res.end();
  }

  /**
   * Get color for entity group
   */
  private getEntityColor(entity: string): string {
    const colorMap: Record<string, string> = {
      'product': 'FFE2EFDA',     // Light green
      'products': 'FFE2EFDA',
      'project': 'FFFDE9D9',     // Light orange
      'projects': 'FFFDE9D9',
      'brand': 'FFD9E1F2',       // Light blue
      'brands': 'FFD9E1F2',
      'category': 'FFE2EFDA',    // Light green
      'categories': 'FFE2EFDA',
      'user': 'FFF2DCDB',        // Light red
      'users': 'FFF2DCDB',
      'branch': 'FFDCE6F1',      // Light blue
      'branches': 'FFDCE6F1',
      'stock': 'FFEDEDED',       // Light gray
      'stocks': 'FFEDEDED',
      'sale': 'FFE2EFDA',        // Light green
      'sales': 'FFE2EFDA'
    };
    
    return colorMap[entity.toLowerCase()] || 'FFE2EFDA';
  }

  async exportFromUrlOnly(
    url: string, 
    res: any, 
    fileName?: string, 
    authHeader?: any,
  ) {
    try {
      if (!url) {
        throw new BadRequestException('URL parameter is required');
      }

      const rawData = await this.fetchDataFromUrl(url, authHeader);
      const data = this.extractDataFromResponse(rawData);
      
      // Extract main entity from URL
      const mainEntity = this.extractMainEntityFromUrl(url);
      console.log(`Processing ${data.length} ${mainEntity} records for export`);

      return this.exportRowsToExcel(res, data, mainEntity, {
        fileName: fileName || mainEntity || 'exported_data',
        sheetName: mainEntity.charAt(0).toUpperCase() + mainEntity.slice(1),
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

    return this.exportRowsToExcel(res, data, normalized, {
      fileName: normalized,
      sheetName: normalized.charAt(0).toUpperCase() + normalized.slice(1),
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