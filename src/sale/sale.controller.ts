// sale.controller.ts
import { Controller, Get, Post, Body, Param, Patch, Delete, Query, Res, UseGuards, Req, Put } from '@nestjs/common';
import { SaleService } from './sale.service';
import { CreateSaleDto, UpdateSaleDto } from 'dto/sale.dto';
import { CRUD } from 'common/crud.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';

@UseGuards(AuthGuard)
@Controller('sales')
export class SaleController {
  constructor(private readonly saleService: SaleService) {}

  // 🔹 Export sales data to Excel
  @Get('/export')
  @Permissions(EPermission.SALE_EXPORT)
  async exportData(@Query('limit') limit: number, @Res() res: any) {
    return CRUD.exportEntityToExcel(this.saleService.saleRepo, 'sale', res, { exportLimit: limit });
  }

  @Post()
  @Permissions(EPermission.SALE_CREATE)
  create(@Body() dto: CreateSaleDto) {
    return this.saleService.create(dto);
  }

  @Put(':id')
  @Permissions(EPermission.SALE_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateSaleDto) {
    return this.saleService.update(id, dto);
  }

  @Get()
  @Permissions(EPermission.SALE_READ)
  findAll(@Query() query: any , @Req() req:any) {
		// const mergedFilters: any = {
    //   ...parsedFilters,
    // };

    // if (query.filters.fromDate) {
    //   mergedFilters.audit_date_from = query.filters.fromDate; // will map to audit.audit_date >= fromDate
    // }
    // if (query.filters.toDate) {
    //   mergedFilters.audit_date_to = query.filters.toDate; // will map to audit.audit_date <= toDate
    // }

    return CRUD.findAll(this.saleService.saleRepo, 'sale', query.search, query.page, query.limit, query.sortBy, query.sortOrder, [ "user", "product", "branch"], ['status'], {projectId : req.user.project.id , ...query.filters});
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
    return this.saleService.findSalesWithBrand(
      'sale', 
      query.search, 
      query.page, 
      query.limit, 
      query.sortBy, 
      query.sortOrder, 
      ["user", "product", "branch"], 
      ['status'], 
      { branch: { id: branchId }, ...query.filters }
    );
  }

  @Get('by-product/:productId')
  @Permissions(EPermission.SALE_READ)
  findByProduct(@Param('productId') productId: string, @Query() query: any) {
    return this.saleService.findSalesWithBrand(
      'sale', 
      query.search, 
      query.page, 
      query.limit, 
      query.sortBy, 
      query.sortOrder, 
      ["user", "product", "branch"], 
      ['status'], 
      { product: { id: productId }, ...query.filters }
    );
  }

// sale.controller.ts
@Get('by-user/:userId')
@Permissions(EPermission.SALE_READ)
findByUser(@Param('userId') userId: string, @Query() query: any) {
  return this.saleService.findSalesByUserOptimized(
    userId,
    query.search, 
    query.page, 
    query.limit, 
    query.sortBy, 
    query.sortOrder, 
    { ...query.filters }
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