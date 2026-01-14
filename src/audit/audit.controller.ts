// audits.controller.ts
import { Controller, Post, Get, Patch, Delete, Param, Body, Query, ParseUUIDPipe, Req, UseGuards, Res, HttpStatus, NotFoundException, Headers } from '@nestjs/common';
import { Response } from 'express';
import { CreateAuditDto, QueryAuditsDto, UpdateAuditDto } from 'dto/audit.dto';
import { Audit, DiscountReason } from 'entities/audit.entity';
import { AuditsService } from './audit.service';
import { AuditExportService } from './audit-export.service';
import { CRUD } from 'common/crud.service';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { AuthGuard } from 'src/auth/auth.guard';
import { UsersService } from 'src/users/users.service';


@Controller('audits')
@UseGuards(AuthGuard)
export class AuditsController {
  constructor(
    private readonly service: AuditsService,
    private readonly exportService: AuditExportService,
    private readonly userService: UsersService,  
  ) {}
  @Get('discount-reasons')
  @Permissions(EPermission.AUDIT_READ)
  async getDiscountReasons(@Headers('lang') langHeader?: string) {
    const allReasons = this.exportService.getTranslatedDiscountReasons();

    // Default to English if no header
    const lang = (langHeader || 'en').toLowerCase();
    const useArabic = lang === 'ar';

    const filteredReasons = allReasons.map(reason => ({
      value: reason.value,
      label: useArabic ? reason.label_ar : reason.label_en
    }));

    return {
      discount_reasons: filteredReasons
    };
  }

  @Get('countries')
  @Permissions(EPermission.AUDIT_READ)
  async getCountries(@Headers('lang') langHeader: string) {
    const allCountries = this.exportService.getTranslatedCountries();

    // Default to English if no header
    const lang = (langHeader || 'en').toLowerCase();
    const useArabic = lang === 'ar';

    const filteredCountries = allCountries

      .map(country => ({
        value: country.value,
        label: useArabic ? country.label_ar : country.label_en
      }));

    return { countries: filteredCountries };
  }
  @Post()
  @Permissions(EPermission.AUDIT_CREATE)
  async create(@Req() req: any, @Body() dto: CreateAuditDto) {
    // أخذ promoter_id من المستخدم المسجل دخوله
    const promoterId = req.user.id;
    return this.service.create(dto, promoterId);
  }
  @Get('')
  @Permissions(EPermission.AUDIT_READ)
  async getAudit(@Query() query, @Req() req) {
    const {
      search,
      page = 1,
      limit = 10,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      fromDate,
      toDate,
      filters,
      status,
      branch_id,
      promoter_id,
      product_id,
      is_national,

      brand_id,
      category_id,
      brand_name,
      category_name,
      project_id,
    } = query;

    let parsedFilters: any = {};
    const user = await this.service.userRepo.findOne({
      where: { id: req.user.id },
      relations: ['role', 'project', 'branch']
    });

    if (filters) {
      if (typeof filters === 'string') {
        try {
          parsedFilters = JSON.parse(filters);
        } catch (e) {
          parsedFilters = {};
        }
      } else {
        parsedFilters = filters;
      }
    }

    const mergedFilters: any = {
      ...parsedFilters,
    };

    const project = await this.userService.resolveProjectIdFromUser(user.id)

    // If user has a specific project, only show audits from that project

    mergedFilters.projectId = project;
    // Apply query parameter filters (only if not already set by role-based filtering)
    if (status) mergedFilters.status = status;
    if (branch_id) mergedFilters.branchId = branch_id;
    if (promoter_id) mergedFilters.promoterId = promoter_id;
    if (product_id) mergedFilters.productId = product_id;
    if (is_national !== undefined) mergedFilters.is_national = is_national === 'true';

    // Enhanced brand and category filters
    if (brand_id) mergedFilters.brandId = brand_id;
    if (category_id) mergedFilters.categoryId = category_id;
    if (brand_name) mergedFilters.brand_name = brand_name;
    if (category_name) mergedFilters.category_name = category_name;

    // Date range filters
    if (fromDate) {
      mergedFilters.audit_date_from = fromDate;
    }
    if (toDate) {
      mergedFilters.audit_date_to = toDate;
    }

    // Include all necessary relations
    const relations = [
      'branch',
      'promoter',
      'branch.city',
      'branch.city.region',
      'branch.chain',
      'branch.project',
      'product',
      'product.brand',
      'product.category',
      'auditCompetitors',
      'auditCompetitors.competitor',
    ];

    // Add category filter at audit level (if audit has direct category relation)
    // Note: If you need category filtering at different levels, you might need to use query builder
    if (category_id) {
      mergedFilters['product.category.id'] = category_id;
    }
    const result = await CRUD.findAllRelation(
      this.service.repo,
      'audit',
      search,
      page,
      limit,
      sortBy,
      sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
      relations,
      [], // searchFields
      mergedFilters,
    );

    // تحميل المنافسين لكل المراجعات في النتيجة
    if (result.records && Array.isArray(result.records)) {
      await this.service.loadCompetitorsForAudits(result.records);
    }

    return result;
  }

  @Get(':id')
  @Permissions(EPermission.AUDIT_READ)

  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return CRUD.findOne(this.service.repo, 'audit', id, ['product', 'promoter', 'branch', 'reviewed_by']);
  }

  @Patch(':id')
  @Permissions(EPermission.AUDIT_UPDATE)

  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateAuditDto) {
    return this.service.update(id, dto);
  }



  @Delete(':id')
  @Permissions(EPermission.AUDIT_DELETE)

  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return CRUD.softDelete(this.service.repo, 'audit', id);
  }

  // === Export Endpoints ===

  @Get('export/excel')
  @Permissions(EPermission.AUDIT_READ)

  async exportExcel(
    @Query() query: any,
    @Res() res: Response,
    @Req() req: any
  ) {
    try {
      const buffer = await this.exportService.exportToExcel(query,req);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `audit-report-${timestamp}.xlsx`;

      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length,
      });

      res.end(buffer);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to export Excel file',
        error: error.message,
      });
    }
  }





  // === Audit Statistics ===

  @Get('stats/daily')
  @Permissions(EPermission.AUDIT_READ)

  async getDailyStats(
    @Req() req: any,
    @Query('date') date?: string
  ) {
    const targetDate = date || new Date().toISOString().split('T')[0];


    const stats = await this.service.repo
      .createQueryBuilder('audit')
      .select([
        'COUNT(*) as total_audits',
        'SUM(CASE WHEN is_available = true THEN 1 ELSE 0 END) as available_products',
        'SUM(CASE WHEN is_available = false THEN 1 ELSE 0 END) as unavailable_products',
        'COUNT(DISTINCT promoterId) as unique_promoters',
        'COUNT(DISTINCT branchId) as unique_branches',
      ])

      .andWhere('audit.audit_date = :targetDate', { targetDate })
      .getRawOne();

    return {
      date: targetDate,
      ...stats,
    };
  }

  @Get('stats/product/:productId')
  @Permissions(EPermission.AUDIT_READ)

  async getProductStats(@Param('productId', new ParseUUIDPipe()) productId: string) {
    const product = await this.service.productRepo.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const stats = await this.service.repo
      .createQueryBuilder('audit')
      .select([
        'COUNT(*) as total_audits',
        'AVG(current_price) as average_price',
        'MIN(current_price) as min_price',
        'MAX(current_price) as max_price',
        'AVG(current_discount) as average_discount',
      ])
      .where('audit.productId = :productId', { productId })
      .getRawOne();

    return {
      product: {
        id: product.id,
        name: product.name,
        brand: product.brand?.name,
        category: product.category?.name,
      },
      ...stats,
    };
  }

  // === Helper endpoints ===

  @Get('by-product/:productId')
  @Permissions(EPermission.AUDIT_READ)

  byProduct(@Param('productId', new ParseUUIDPipe()) productId: string, @Query() query: any) {
    return CRUD.findAll(
      this.service.repo,
      'audit',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      ['branch', 'promoter'],
      [],
      { productId },
    );
  }

  @Get('by-branch/:branchId')
  @Permissions(EPermission.AUDIT_READ)

  byBranch(@Param('branchId', new ParseUUIDPipe()) branchId: string, @Query() query: any) {
    return CRUD.findAll(
      this.service.repo,
      'audit',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      ['promoter', 'product'],
      [],
      { branchId },
    );
  }

  @Get('by-promoter/:promoterId')
  @Permissions(EPermission.AUDIT_READ)

  byPromoter(@Param('promoterId', new ParseUUIDPipe()) promoterId: string, @Query() query: any) {
    return CRUD.findAll(
      this.service.repo,
      'audit',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      ['branch', 'product'],
      [],
      { promoterId },
    );
  }

  @Get('promoter/today-audits')
  @Permissions(EPermission.AUDIT_READ)

  async getTodayAudits(@Req() req: any, @Query() query: any) {
    const today = new Date().toISOString().split('T')[0];
    const promoterId = req.user.id;

    return CRUD.findAll(
      this.service.repo,
      'audit',
      query.search,
      query.page || 1,
      query.limit || 50,
      'created_at',
      'DESC',
      ['branch', 'product'],
      [],
      { promoterId, audit_date: today },
    );
  }

  @Get('promoter/:branch_id/products-status')
  @Permissions(EPermission.AUDIT_READ)

  async getAllProductsWithAuditStatus(
    @Req() req: any,
    @Param('branch_id') branchId: string,

    @Query() query: {
      brand?: string;
      category?: string;
      search?: string;
      page?: string;
      limit?: string;
    }
  ) {
    const filters = {
      brand: query.brand,
      category: query.category,
      search: query.search,
      page: query.page ? parseInt(query.page) : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined
    };

    return this.service.getAllProductsWithTodayAuditStatusPaginated(req.user.id, branchId,filters);
  }

  @Get('promoter/can-audit/:productId')
  @Permissions(EPermission.AUDIT_READ)

  async canAuditProduct(
    @Req() req: any,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Query('branch_id') branchId?: string
  ) {
    const promoterId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // If branch_id not provided, use promoter's default branch
    let targetBranchId = branchId;
    if (!targetBranchId) {
      const promoter = await this.service.userRepo.findOne({
        where: { id: promoterId },
        relations: ['branch']
      });
      targetBranchId = promoter?.branch?.id;

      if (!targetBranchId) {
        return {
          can_audit: false,
          reason: 'Promoter is not assigned to any branch'
        };
      }
    }

    // Check if audit already exists today
    const existingAudit = await this.service.repo.findOne({
      where: {
        promoterId,
        productId,
        branchId: targetBranchId,
        audit_date: today
      }
    });

    return {
      can_audit: !existingAudit,
      reason: existingAudit ?
        `Already audited this product today at ${existingAudit.created_at.toLocaleTimeString()}` :
        'Can audit this product',
      branch_id: targetBranchId,
      product_id: productId,
      promoter_id: promoterId,
      today: today,
    };
  }

  // === Competitor Analysis ===


}