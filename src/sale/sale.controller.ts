import { Controller, Get, Post, Body, Param, Patch, Delete, Query, Res, UseGuards, Req } from '@nestjs/common';
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

  // 🔹 Create a new sale
  @Post()
  @Permissions(EPermission.SALE_CREATE)
  create(@Body() dto: CreateSaleDto) {
    return this.saleService.create(dto);
  }


  // 🔹 Get all sales
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
    return CRUD.softDelete(this.saleService.saleRepo, 'sale', id);
  }

  // 🔹 Cancel or return a sale
  @Post(':id/return')
  @Permissions(EPermission.SALE_RETURN)
  cancelOrReturn(@Param('id') id: string) {
    return this.saleService.cancelOrReturn(id);
  }

  // 🔹 Get sales by branch
  @Get('by-branch/:branchId')
  @Permissions(EPermission.SALE_READ)
  findByBranch(@Param('branchId') branchId: string, @Query() query: any) {
    return CRUD.findAll(this.saleService.saleRepo, 'sale', query.search, query.page, query.limit, query.sortBy, query.sortOrder, [ "user", "product", "branch"], ['status'], { branch: { id: branchId  } , ...query.filters});
  }

  // 🔹 Get sales by product
  @Get('by-product/:productId')
  @Permissions(EPermission.SALE_READ)
  findByProduct(@Param('productId') productId: string, @Query() query: any) {
    return CRUD.findAll(this.saleService.saleRepo, 'sale', query.search, query.page, query.limit, query.sortBy, query.sortOrder, [ "user", "product", "branch"], ['status'], { product: { id: productId } , ...query.filters});
  }

  // 🔹 Get sales by user
  @Get('by-user/:userId')
  @Permissions(EPermission.SALE_READ)
  findByUser(@Param('userId') userId: string, @Query() query: any) {
    return CRUD.findAll(this.saleService.saleRepo, 'sale', query.search, query.page, query.limit, query.sortBy, query.sortOrder, [ "user", "product", "branch"], ['status'], { user: { id: userId }, ...query.filters });
  }
}
