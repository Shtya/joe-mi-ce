// audit-export.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Audit } from 'entities/audit.entity';
import * as ExcelJS from 'exceljs';
import * as archiver from 'archiver';
import { Response } from 'express';
import { User } from 'entities/user.entity';

@Injectable()
export class AuditExportService {
  constructor(
    @InjectRepository(Audit) private readonly auditRepo: Repository<Audit>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,

  ) {}

  async exportToExcel(query: any, req: any): Promise<Buffer> {
    // Get user with project info
    const user = await this.userRepo.findOne({ 
      where: { id: req.user.id }, 
      relations: ['project', 'branch'] 
    });
    
    // Build where conditions
    const whereConditions: any = {};
    const relations = ['branch', 'promoter', 'product', 'product.brand', 'product.category'];
    
    // Date range filtering
    if (query.from_date && query.to_date) {
      whereConditions.audit_date = Between(query.from_date, query.to_date);
    } else if (query.from_date) {
      whereConditions.audit_date = Between(query.from_date, new Date().toISOString().split('T')[0]);
    } else if (query.to_date) {
      whereConditions.audit_date = Between('2000-01-01', query.to_date);
    }
    
    // Basic filters
    if (query.branch_id) whereConditions.branchId = query.branch_id;
    if (query.promoter_id) whereConditions.promoterId = query.promoter_id;
    if (query.product_id) whereConditions.productId = query.product_id;
    if (query.is_national !== undefined) whereConditions.is_national = query.is_national;
    if (query.status) whereConditions.status = query.status;
    
    // If user has a project and no project_id is provided in query, filter by user's project
    // Since Audit doesn't have direct project relation, we need to filter through branch
    let audits = [];
    
    if (user?.project?.id && !query.project_id) {
      // User has a project - filter audits through branch.project
      // Use query builder to join and filter by project
      const queryBuilder = this.auditRepo.createQueryBuilder('audit')
        .leftJoinAndSelect('audit.branch', 'branch')
        .leftJoinAndSelect('audit.promoter', 'promoter')
        .leftJoinAndSelect('audit.product', 'product')
        .leftJoinAndSelect('product.brand', 'brand')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('branch.project', 'branchProject');
      
      // Build where conditions for query builder
      let qbWhere = '1=1'; // Start with always true condition
      
      if (Object.keys(whereConditions).length > 0) {
        // Convert whereConditions to query builder conditions
        if (whereConditions.audit_date) {
          qbWhere += ` AND audit.audit_date BETWEEN '${whereConditions.audit_date.value[0]}' AND '${whereConditions.audit_date.value[1]}'`;
        }
        
        if (whereConditions.branchId) {
          qbWhere += ` AND branch.id = '${whereConditions.branchId}'`;
        }
        
        if (whereConditions.promoterId) {
          qbWhere += ` AND promoter.id = '${whereConditions.promoterId}'`;
        }
        
        if (whereConditions.productId) {
          qbWhere += ` AND product.id = '${whereConditions.productId}'`;
        }
        
        if (whereConditions.status) {
          qbWhere += ` AND audit.status = '${whereConditions.status}'`;
        }
        
        if (whereConditions.is_national !== undefined) {
          qbWhere += ` AND audit.is_national = ${whereConditions.is_national}`;
        }
      }
      
      // Add project filter
      qbWhere += ` AND branchProject.id = '${user.project.id}'`;
      
      // Add brand and category filters from query
      if (query.brand_id) {
        qbWhere += ` AND brand.id = '${query.brand_id}'`;
      }
      
      if (query.category_id) {
        qbWhere += ` AND category.id = '${query.category_id}'`;
      }
      
      if (query.brand_name) {
        qbWhere += ` AND brand.name ILIKE '%${query.brand_name}%'`;
      }
      
      if (query.category_name) {
        qbWhere += ` AND category.name ILIKE '%${query.category_name}%'`;
      }
      
      // Apply where clause
      queryBuilder.where(qbWhere);
      
      // Order by
      queryBuilder.orderBy('audit.audit_date', 'DESC');
      queryBuilder.addOrderBy('audit.created_at', 'DESC');
      
      // Get all audits
      audits = await queryBuilder.getMany();
      
    } else {
      // No project filter needed or project_id provided in query
      // Use simple find method
      const findOptions: any = {
        where: whereConditions,
        relations: relations,
        order: { audit_date: 'DESC', created_at: 'DESC' }
      };
      
      // If project_id is provided in query, we need query builder
      if (query.project_id) {
        const queryBuilder = this.auditRepo.createQueryBuilder('audit')
          .leftJoinAndSelect('audit.branch', 'branch')
          .leftJoinAndSelect('audit.promoter', 'promoter')
          .leftJoinAndSelect('audit.product', 'product')
          .leftJoinAndSelect('product.brand', 'brand')
          .leftJoinAndSelect('product.category', 'category')
          .leftJoinAndSelect('branch.project', 'branchProject');
        
        let qbWhere = '1=1';
        
        // Add basic conditions
        if (Object.keys(whereConditions).length > 0) {
          if (whereConditions.audit_date) {
            qbWhere += ` AND audit.audit_date BETWEEN '${whereConditions.audit_date.value[0]}' AND '${whereConditions.audit_date.value[1]}'`;
          }
          
          if (whereConditions.branchId) {
            qbWhere += ` AND branch.id = '${whereConditions.branchId}'`;
          }
          
          if (whereConditions.promoterId) {
            qbWhere += ` AND promoter.id = '${whereConditions.promoterId}'`;
          }
          
          if (whereConditions.productId) {
            qbWhere += ` AND product.id = '${whereConditions.productId}'`;
          }
          
          if (whereConditions.status) {
            qbWhere += ` AND audit.status = '${whereConditions.status}'`;
          }
          
          if (whereConditions.is_national !== undefined) {
            qbWhere += ` AND audit.is_national = ${whereConditions.is_national}`;
          }
        }
        
        // Add project filter from query
        qbWhere += ` AND branchProject.id = '${query.project_id}'`;
        
        // Add brand and category filters
        if (query.brand_id) {
          qbWhere += ` AND brand.id = '${query.brand_id}'`;
        }
        
        if (query.category_id) {
          qbWhere += ` AND category.id = '${query.category_id}'`;
        }
        
        if (query.brand_name) {
          qbWhere += ` AND brand.name ILIKE '%${query.brand_name}%'`;
        }
        
        if (query.category_name) {
          qbWhere += ` AND category.name ILIKE '%${query.category_name}%'`;
        }
        
        queryBuilder.where(qbWhere);
        queryBuilder.orderBy('audit.audit_date', 'DESC');
        queryBuilder.addOrderBy('audit.created_at', 'DESC');
        
        audits = await queryBuilder.getMany();
      } else {
        // Simple find without project filtering
        audits = await this.auditRepo.find(findOptions);
      }
    }
    
    // Create Excel file
    const workbook = new ExcelJS.Workbook();
    
    // Add English sheet
    this.createEnglishSheet(workbook, audits);
    
    // Add Arabic sheet
    this.createArabicSheet(workbook, audits);
  
    // Generate file
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

// audit-export.service.ts (updated Excel export methods)
private createEnglishSheet(workbook: ExcelJS.Workbook, audits: Audit[]): void {
    const worksheet = workbook.addWorksheet('Audit Report - English');
  
    // Headers in English
    const headers = [
      'Date',
      'Auditor',
      'City',
      'Branch',
      'Product Name',
      'Brand',
      'Category',
      
      // Main product info
      'Available?',
      'Price',
      'Discount %',
      'Discount Reason',
      'National?',
      'Notes',
      
      // Competitor info
      'Total Competitors',
      'Available Competitors',
      
      // Competitor columns (up to 10 competitors)
      ...Array.from({ length: 10 }, (_, i) => [
        `Comp ${i + 1} Name`,
        `Comp ${i + 1} Price`,
        `Comp ${i + 1} Discount`,
        `Comp ${i + 1} Available`,
        `Comp ${i + 1} National`,
        `Comp ${i + 1} Discount Reason`
      ]).flat(),
      
      'Status',
      'Audit ID'
    ];
  
    // Add headers
    const headerRow = worksheet.addRow(headers);
    
    // Format headers
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '2E75B6' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  
    // Add data
    audits.forEach(audit => {
      const competitors = audit.auditCompetitors || [];
      
      // Prepare competitor data
      const compData = [];
      for (let i = 0; i < 10; i++) {
        if (competitors[i]) {
          compData.push(
            competitors[i].competitor?.name || `Competitor ${i + 1}`,
            competitors[i].price || 0,
            competitors[i].discount || 0,
            competitors[i].is_available ? 'Yes' : 'No',
            competitors[i].is_national ? 'Yes' : 'No',
            competitors[i].discount_reason || ''
          );
        } else {
          compData.push('', '', '', '', '', '');
        }
      }
  
      // Create row
      const row = [
        audit.audit_date,
        audit.promoter?.name || '',
        audit.branch?.city?.name || '',
        audit.branch?.name || '',
        audit.product_name || '',
        audit.product_brand || '',
        audit.product_category || '',
        
        // Main product answers
        audit.is_available ? 'Yes' : 'No',
        audit.current_price || 0,
        audit.current_discount || 0,
        audit.discount_reason || '',
    
        
        // Competitor info
        audit.competitors_count || 0,
        audit.available_competitors_count || 0,
        
        // Competitor data
        ...compData,
        
        audit.id
      ];
  
      const dataRow = worksheet.addRow(row);
      
      // Format even rows
      if (dataRow.number % 2 === 0) {
        dataRow.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'F2F2F2' }
          };
        });
      }
    });
  
    // Auto-size columns
    worksheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const cellLength = cell.value ? cell.value.toString().length : 0;
        maxLength = Math.max(maxLength, cellLength);
      });
      column.width = Math.min(maxLength + 2, 30);
    });
  }
  
  private createArabicSheet(workbook: ExcelJS.Workbook, audits: Audit[]): void {
    const worksheet = workbook.addWorksheet('تقرير المراجعة - عربي');
  
    // Headers in Arabic
    const headers = [
      'التاريخ',
      'المدقق',
      'المدينة',
      'الفرع',
      'اسم المنتج',
      'العلامة التجارية',
      'الفئة',
      
      // Main product info
      'متوفر؟',
      'السعر',
      'نسبة الخصم',
      'سبب الخصم',
      'محلي؟',
      'ملاحظات',
      
      // Competitor info
      'عدد المنافسين',
      'المنافسين المتوفرين',
      
      // Competitor columns
      ...Array.from({ length: 10 }, (_, i) => [
        `اسم المنافس ${i + 1}`,
        `سعر المنافس ${i + 1}`,
        `خصم المنافس ${i + 1}`,
        `متوفر ${i + 1}؟`,
        `محلي ${i + 1}؟`,
        `سبب خصم ${i + 1}`
      ]).flat(),
      
      'الحالة',
      'رقم المراجعة'
    ];
  
    // Add headers
    const headerRow = worksheet.addRow(headers);
    
    // Format Arabic headers
    headerRow.eachCell((cell) => {
      cell.font = { 
        bold: true, 
        color: { argb: 'FFFFFF' },
        name: 'Arial'
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '2E75B6' }
      };
      cell.alignment = { 
        vertical: 'middle', 
        horizontal: 'center',
        readingOrder: 'rtl'
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  
    // Add data
    audits.forEach((audit, index) => {
      const competitors = audit.auditCompetitors || [];
      
      // Prepare competitor data
      const compData = [];
      for (let i = 0; i < 10; i++) {
        if (competitors[i]) {
          compData.push(
            competitors[i].competitor?.name || `منافس ${i + 1}`,
            competitors[i].price || 0,
            competitors[i].discount || 0,
            competitors[i].is_available ? 'نعم' : 'لا',
            competitors[i].is_national ? 'نعم' : 'لا',
            competitors[i].discount_reason || ''
          );
        } else {
          compData.push('', '', '', '', '', '');
        }
      }
  
      // Create row
      const row = [
        audit.audit_date,
        audit.promoter?.name || '',
        audit.branch?.city?.name || '',
        audit.branch?.name || '',
        audit.product_name || '',
        audit.product_brand || '',
        audit.product_category || '',
        
        // Main product answers
        audit.is_available ? 'نعم' : 'لا',
        audit.current_price || 0,
        audit.current_discount || 0,
        audit.discount_reason || '',
   
        
        // Competitor info
        audit.competitors_count || 0,
        audit.available_competitors_count || 0,
        
        // Competitor data
        ...compData,
        
        audit.id
      ];
  
      const dataRow = worksheet.addRow(row);
      
      // Format Arabic text direction
      dataRow.eachCell((cell) => {
        cell.alignment = { 
          horizontal: 'right',
          readingOrder: 'rtl'
        };
      });
      
      // Format even rows
      if (index % 2 === 0) {
        dataRow.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'F2F2F2' }
          };
        });
      }
    });
  
    // Auto-size columns
    worksheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const cellLength = cell.value ? cell.value.toString().length : 0;
        maxLength = Math.max(maxLength, cellLength);
      });
      column.width = Math.min(maxLength + 2, 30);
    });
  }

}