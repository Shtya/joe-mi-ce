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

    // Fetch logged-in user including project
    const user = await this.userRepo.findOne({
      where: { id: req.user.id },
      relations: ['project'],
    });
  
    if (!user?.project?.id) {
      throw new Error("User does not belong to a project");
    }
  
    // --- Build Query ---
    const qb = this.auditRepo.createQueryBuilder('audit')
      .leftJoinAndSelect('audit.branch', 'branch')
      .leftJoinAndSelect('branch.city', 'city')
      .leftJoinAndSelect('city.region', 'region')
      .leftJoinAndSelect('branch.project', 'project')
      .leftJoinAndSelect('audit.promoter', 'promoter')
      .leftJoinAndSelect('audit.product', 'product')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('audit.auditCompetitors', 'auditCompetitors')
      .leftJoinAndSelect('auditCompetitors.competitor', 'competitor');
  
    // 🔥 ALWAYS FILTER BY USER'S PROJECT
    qb.andWhere('project.id = :pid', { pid: user.project.id });
  
    // Date filtering
    if (query.from_date && query.to_date) {
      qb.andWhere('audit.audit_date BETWEEN :from AND :to', {
        from: query.from_date,
        to: query.to_date,
      });
    } else if (query.from_date) {
      qb.andWhere('audit.audit_date >= :from', { from: query.from_date });
    } else if (query.to_date) {
      qb.andWhere('audit.audit_date <= :to', { to: query.to_date });
    }
  
    // Extra filters
    if (query.branch_id) qb.andWhere('branch.id = :branch', { branch: query.branch_id });
    if (query.promoter_id) qb.andWhere('promoter.id = :promoter', { promoter: query.promoter_id });
    if (query.product_id) qb.andWhere('product.id = :product', { product: query.product_id });
    if (query.status) qb.andWhere('audit.status = :status', { status: query.status });
    if (query.is_national !== undefined)
      qb.andWhere('audit.is_national = :nat', { nat: query.is_national });
  
    // Brand + Category filters
    if (query.brand_id) qb.andWhere('brand.id = :brandId', { brandId: query.brand_id });
    if (query.category_id) qb.andWhere('category.id = :catId', { catId: query.category_id });
    if (query.brand_name)
      qb.andWhere('brand.name ILIKE :bname', { bname: `%${query.brand_name}%` });
    if (query.category_name)
      qb.andWhere('category.name ILIKE :cname', { cname: `%${query.category_name}%` });
  
    // Sorting
    qb.orderBy('audit.audit_date', 'DESC')
      .addOrderBy('audit.created_at', 'DESC');
  
    const audits = await qb.getMany();
  
    // --- Excel ---
    const workbook = new ExcelJS.Workbook();
    this.createEnglishSheet(workbook, audits);
    this.createArabicSheet(workbook, audits);
  
    const uint = await workbook.xlsx.writeBuffer();
    const nodeBuffer = Buffer.from(uint);  // valid conversion
    return nodeBuffer;
    
  }

// audit-export.service.ts (updated Excel export methods)
private createEnglishSheet(workbook: ExcelJS.Workbook, audits: Audit[]): void {
    const worksheet = workbook.addWorksheet('Audit Report - English');
  
    const headers = [
      'Date',
      'Auditor',
      'City',
      'Region',
      'Branch',
      'Product Name',
      'Brand',
      'Category',
  
      'Available',
      'Price',
      'Discount %',
      'Discount Reason',
     
  
      'Total Competitors',
      'Available Competitors',
  
      ...Array.from({ length: 10 }, (_, i) => [
        `Comp ${i + 1} Name`,
        `Comp ${i + 1} Price`,
        `Comp ${i + 1} Discount`,
        `Comp ${i + 1} Available`,
        `Comp ${i + 1} National`,
        `Comp ${i + 1} Discount Reason`,
      ]).flat(),
    ];
  
    const headerRow = worksheet.addRow(headers);
  
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '2E75B6' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
  
    audits.forEach(audit => {
      const competitors = audit.auditCompetitors || [];
        console.log('Competitors:', competitors);
      const totalCompetitors = competitors.length;
      const availableCompetitors = competitors.filter(c => c.is_available).length;
  
      const compData = [];
  
      for (let i = 0; i < 10; i++) {
        const c = competitors[i];
  
        if (c) {
          compData.push(
            c.competitor?.name || '',
            c.price ?? '',
            c.discount ?? '',
            c.is_available ? 'Yes' : 'No',
            c.is_national ? 'Yes' : 'No',
            c.discount_reason || '',
          );
        } else {
          compData.push('', '', '', '', '', '');
        }
      }
  
      const row = [
        audit.audit_date,
        audit.promoter?.name || '',
        audit.branch?.city?.name || '',
        audit.branch?.city?.region?.name || '',
        audit.branch?.name || '',
        audit.product_name || '',
        audit.product_brand || '',
        audit.product_category || '',
  
        audit.is_available ? 'Yes' : 'No',
        audit.current_price ?? 0,
        audit.current_discount ?? 0,
        audit.discount_reason || '',
       
  
        totalCompetitors,
        availableCompetitors,
  
        ...compData,
      ];
  
      worksheet.addRow(row);
    });
  
    worksheet.columns.forEach(column => {
      let maxLength = 12;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const length = cell.value ? cell.value.toString().length : 0;
        maxLength = Math.max(maxLength, length);
      });
      column.width = maxLength + 2;
    });
  }
  
  
  private createArabicSheet(workbook: ExcelJS.Workbook, audits: Audit[]): void {
    const worksheet = workbook.addWorksheet('تقرير المراجعة - عربي');
  
    const headers = [
      'التاريخ',
      'المدقق',
      'المدينة',
      'المنطقة',
      'الفرع',
      'اسم المنتج',
      'العلامة التجارية',
      'الفئة',
  
      'متوفر؟',
      'السعر',
      'نسبة الخصم',
      'سبب الخصم',
     
  
      'عدد المنافسين',
      'عدد المتوفرين',
  
      ...Array.from({ length: 10 }, (_, i) => [
        `اسم المنافس ${i + 1}`,
        `سعر المنافس ${i + 1}`,
        `خصم المنافس ${i + 1}`,
        `متوفر ${i + 1}?`,
        `محلي ${i + 1}?`,
        `سبب الخصم ${i + 1}`,
      ]).flat(),
    ];
  
    const headerRow = worksheet.addRow(headers);
  
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' }, name: 'Arial' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '2E75B6' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
    });
  
    audits.forEach(audit => {
      const competitors = audit.auditCompetitors || [];
  
      const totalCompetitors = competitors.length;
      const availableCompetitors = competitors.filter(c => c.is_available).length;
  
      const compData = [];
  
      for (let i = 0; i < 10; i++) {
        const c = competitors[i];
  
        if (c) {
          compData.push(
            c.competitor?.name || '',
            c.price ?? '',
            c.discount ?? '',
            c.is_available ? 'نعم' : 'لا',
            c.is_national ? 'نعم' : 'لا',
            c.discount_reason || '',
          );
        } else {
          compData.push('', '', '', '', '', '');
        }
      }
  
      const row = [
        audit.audit_date,
        audit.promoter?.name || '',
        audit.branch?.city?.name || '',
        audit.branch?.city?.region?.name || '',
        audit.branch?.name || '',
        audit.product_name || '',
        audit.product_brand || '',
        audit.product_category || '',
  
        audit.is_available ? 'نعم' : 'لا',
        audit.current_price ?? 0,
        audit.current_discount ?? 0,
        audit.discount_reason || '',
  
  
        totalCompetitors,
        availableCompetitors,
  
        ...compData,
      ];
  
      const rowObj = worksheet.addRow(row);
  
      rowObj.eachCell(cell => {
        cell.alignment = { horizontal: 'right', readingOrder: 'rtl' };
      });
    });
  
    worksheet.columns.forEach(column => {
      let maxLength = 12;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const length = cell.value ? cell.value.toString().length : 0;
        maxLength = Math.max(maxLength, length);
      });
      column.width = maxLength + 2;
    });
  }
  

}