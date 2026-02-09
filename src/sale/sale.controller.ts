// sale.controller.ts
import { Controller, Get, Post, Body, Param, Patch, Delete, Query, Res, UseGuards, Req, Put, Header, ParseUUIDPipe } from '@nestjs/common';
import { SaleService } from './sale.service';
import { CreateSaleDto, UpdateSaleDto } from 'dto/sale.dto';
import { CRUD } from 'common/crud.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { UsersService } from 'src/users/users.service';

@UseGuards(AuthGuard)
@Controller('sales')
export class SaleController {
  constructor(private readonly saleService: SaleService,private readonly userService: UsersService) {}

  // 🔹 Export sales data to Excel
  @Get('/export')
  @Permissions(EPermission.SALE_EXPORT)
  @Get('/export')
  @Permissions(EPermission.SALE_EXPORT)
  async exportData(@Query() query: any, @Req() req: any, @Res() res: any) {
    const project = this.userService.resolveProjectIdFromUser(req.user.id);
    const mergedFilters: any = {
      projectId : project,
      ...query.filters,
    };

    if (query.filters?.project?.id) {
      mergedFilters.projectId = query.filters.project.id;
      delete mergedFilters.project;
    }

    if (query.filters?.fromDate || query.filters?.toDate) {
      mergedFilters.created_at = {};
      if (query.filters.fromDate) mergedFilters.created_at.gte = query.filters.fromDate;
      if (query.filters.toDate) mergedFilters.created_at.lte = query.filters.toDate;
    }
    
    if (mergedFilters.fromDate) delete mergedFilters.fromDate;
    if (mergedFilters.toDate) delete mergedFilters.toDate;
    if (mergedFilters.date) delete mergedFilters.date;
    if (mergedFilters.sale_date_from) delete mergedFilters.sale_date_from;
    if (mergedFilters.sale_date_to) delete mergedFilters.sale_date_to;
    if (mergedFilters.project) delete mergedFilters.project;

    return CRUD.exportEntityToExcel2(
      this.saleService.saleRepo, 
      'sale', 
      'sales_report', 
      res, 
      { 
        exportLimit: query.limit,
        search: query.search,
        filters: mergedFilters,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        relations: ["user", "product", "branch", "branch.chain"],
      }
    );
  }

  @Get()
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
@Header('Pragma', 'no-cache')
@Header('Expires', '0')
  @Permissions(EPermission.SALE_READ)
  findAll(@Query() query: any , @Req() req:any) {
		// const mergedFilters: any = {
    //   ...parsedFilters,
    // };6b140f73-7d36-44ad-89b2-492d482e8997

    // if (query.filters.fromDate) {
    //   mergedFilters.audit_date_from = query.filters.fromDate; // will map to audit.audit_date >= fromDate
    // }
    // if (query.filters.toDate) {
    //   mergedFilters.audit_date_to = query.filters.toDate; // will map to audit.audit_date <= toDate
    // }
    const project = this.userService.resolveProjectIdFromUser(req.user.id);
    const mergedFilters: any = {
      projectId : project,
      ...query.filters, // This might spread 'fromDate'/'toDate' if they exist in query.filters
    };

    if (query.filters?.project?.id) {
      mergedFilters.projectId = query.filters.project.id;
      delete mergedFilters.project;
    }

    if (query.filters?.fromDate || query.filters?.toDate) {
      mergedFilters.created_at = {};
      if (query.filters.fromDate) mergedFilters.created_at.gte = query.filters.fromDate;
      if (query.filters.toDate) mergedFilters.created_at.lte = query.filters.toDate;
    }

    if (mergedFilters.fromDate) delete mergedFilters.fromDate;
    if (mergedFilters.toDate) delete mergedFilters.toDate;
    if (mergedFilters.date) delete mergedFilters.date;
    if (mergedFilters.sale_date_from) delete mergedFilters.sale_date_from;
    if (mergedFilters.sale_date_to) delete mergedFilters.sale_date_to;
    if (mergedFilters.project) delete mergedFilters.project;

    return CRUD.findAll2(this.saleService.saleRepo, 'sale', query.search, query.page, query.limit, query.sortBy, query.sortOrder, [ "user", "product", "branch", "branch.chain"], ['status'], mergedFilters);
  }
  @Post()
  @Permissions(EPermission.SALE_CREATE)
  create(@Body() dto: CreateSaleDto) {
    return this.saleService.create(dto);
  }

  @Get('promoter/:id/today')
  @Permissions(EPermission.SALE_READ)
  async getPromoterSalesForToday(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: any
  ) {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const filters = { ...query.filters };
    if (query.filters?.fromDate) delete filters.fromDate;
    if (query.filters?.toDate) delete filters.toDate;
    if (query.filters?.date) delete filters.date;

    return this.saleService.findSalesByUserOptimized(
      id,
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      filters,
      startDate,
      endDate
    );
  }

  @Get('my-sales')
  @Permissions(EPermission.SALE_READ)
  async getMySales(
    @Req() req: any,
    @Query() query: any
  ) {
    const filters = { ...query.filters };
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (query.startDate) startDate = new Date(query.startDate);
    if (query.endDate) endDate = new Date(query.endDate);
    
    // Also support filters.fromDate / toDate standard we use elsewhere
    if (query.filters?.fromDate) {
        startDate = new Date(query.filters.fromDate);
        delete filters.fromDate;
    }
    if (query.filters?.toDate) {
        endDate = new Date(query.filters.toDate);
        delete filters.toDate;
    }

    return this.saleService.findSalesByUserOptimized(
      req.user.id,
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      filters,
      startDate,
      endDate
    );
  }

  @Put(':id')
  @Permissions(EPermission.SALE_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateSaleDto) {
    return this.saleService.update(id, dto);
  }



  // 🔹 Get sale by ID
  @Get(':id')
  @Permissions(EPermission.SALE_READ)
  findOne(@Param('id') id: string) {
    return CRUD.findOne(this.saleService.saleRepo, 'sale', id, ['product', 'user', 'branch']);
  }

  // 🔹 Delete sale
  @Delete(':id')
  @Permissions(EPermission.SALE_DELETE)
  remove(@Param('id') id: string) {
    return this.saleService.delete(id);
  }

  @Post(':id/cancel')
  @Permissions(EPermission.SALE_RETURN)
  cancelSale(@Param('id') id: string) {
    return this.saleService.cancelSale(id);
  }



  @Post(':id/return')
  @Permissions(EPermission.SALE_RETURN)
  cancelOrReturn(@Param('id') id: string) {
    return this.saleService.cancelOrReturn(id);
  }


  @Get('by-branch/:branchId')
  @Permissions(EPermission.SALE_READ)
  findByBranch(@Param('branchId') branchId: string, @Query() query: any) {
    const filters = { ...query.filters };
    delete filters.fromDate;
    delete filters.toDate;
    delete filters.date;

    return this.saleService.findSalesWithBrand(
      'sale',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      ["user", "product", "branch","branch.salesTargets"],
      ['status'],
      { branch: { id: branchId }, ...filters }
    );
  }



  @Get('by-product/:productId')
  @Permissions(EPermission.SALE_READ)
  findByProduct(@Param('productId') productId: string, @Query() query: any) {
    const filters = { ...query.filters };
    delete filters.fromDate;
    delete filters.toDate;
    delete filters.date;

    return this.saleService.findSalesWithBrand(
      'sale',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      ["user", "product", "branch"],
      ['status'],
      { product: { id: productId }, ...filters }
    );
  }

// sale.controller.ts
@Get('by-user/:userId')
@Permissions(EPermission.SALE_READ)
findByUser(@Param('userId') userId: string, @Query() query: any) {
  const filters = { ...query.filters };
  delete filters.fromDate;
  delete filters.toDate;
  delete filters.date;

  return this.saleService.findSalesByUserOptimized(
    userId,
    query.search,
    query.page,
    query.limit,
    query.sortBy,
    query.sortOrder,
    { ...filters }
  );
}


@Get('branch/:branchId/progress')
  @Permissions(EPermission.SALE_READ)
  getSalesWithTargetProgress(
    @Param('branchId') branchId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.saleService.getSalesWithTargetProgress(branchId, start, end);
  }

  @Get('branch/:branchId/performance')
  @Permissions(EPermission.SALE_READ)
  getSalesPerformance(
    @Param('branchId') branchId: string,
    @Query('period') period: 'day' | 'week' | 'month' | 'quarter' = 'month'
  ) {
    return this.saleService.getSalesPerformanceByBranch(branchId, period);
  }

  @Get('branch/:branchId/product-summary')
  @Permissions(EPermission.SALE_READ)
  getProductSummary(
    @Param('branchId') branchId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.saleService.getSalesSummaryByProduct(branchId, start, end);
  }

  // @Post('bulk')
  // @Permissions(EPermission.SALE_CREATE)
  // bulkCreate(@Body() body: { sales: CreateSaleDto[] }) {
  //   return this.saleService.bulkCreateSales(body.sales);
  // }
}