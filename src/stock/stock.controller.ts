// stock.controller.ts
import { Controller, Post, Body, Get, Param, Patch, Delete, UseGuards, Query, BadRequestException, Res, Req, Put } from '@nestjs/common';
import { StockService } from './stock.service';
import { CreateStockDto, UpdateStockDto } from 'dto/stock.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { CRUD } from 'common/crud.service';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { ExportService } from 'src/export/export.service';
import { PaginationQueryDto } from 'dto/pagination.dto';

@UseGuards(AuthGuard)
@Controller('stock')
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly exportService: ExportService,
  ) {}

  @Get('project/:projectId')
  @Permissions(EPermission.STOCK_READ)
  async getProjectStocks(
    @Req() req, 
    @Param('projectId') projectId?: string, 
    @Query() query?: any,
    @Query('search') search?: string, 
    @Query('page') page: any = 1, 
    @Query('limit') limit: any = 10, 
    @Query('sortBy') sortBy?: string, 
    @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC'
  ) {
    const user = req.user as any;
    const effectiveProjectId = projectId || user?.project_id || user?.project?.id || null;

    if (!effectiveProjectId) {  
      throw new BadRequestException('projectId is required or user must belong to a project');
    }

    return this.stockService.getStocksByProjectPaginated({
      projectId: effectiveProjectId,
      search,
      page,
      limit,
      sortBy,
      sortOrder,
      query
    });
  }

  @Post('upsert')
  @Permissions(EPermission.STOCK_CREATE, EPermission.STOCK_UPDATE)
  async createOrUpdate(@Body() dto: CreateStockDto) {
    return this.stockService.createOrUpdate(dto);
  }

  @Patch('out-of-stock/:id')
  @Permissions(EPermission.STOCK_UPDATE)
  async outOfStock(@Param('id') id: string, @Body() dto: UpdateStockDto) {
    return this.stockService.outOfStock(id, dto);
  }

  @Patch(':id')
  @Permissions(EPermission.STOCK_UPDATE)
  async updateOne(@Param('id') id: string, @Body() dto: UpdateStockDto) {
    return this.stockService.updateOne(id, dto);
  }



  @Delete(':id')
  @Permissions(EPermission.STOCK_UPDATE)
  async deleteStock(@Param('id') id: string) {
    return this.stockService.deleteStock(id);
  }

  @Get('product/:productId')
  @Permissions(EPermission.STOCK_READ)
  getStocksByProduct(@Param('productId') productId: string) {
    return this.stockService.getStocksByProduct(productId);
  }

 
@Get('by-branch/:branchId')
@Permissions(EPermission.STOCK_READ)
async getStocksByBranch(@Param('branchId') branchId: string) {
  const result = await this.stockService.getStocksByBranch(branchId);
  return {
    ...result,
    records: result.records || []
  };
}

@Get('low-stock-alerts')
@Permissions(EPermission.STOCK_READ)
async getLowStockAlertsOptimized(
  @Query('threshold') threshold: number = 10,
  @Query('projectId') projectId?: string
) {
  const result = await this.stockService.getLowStockAlerts(threshold, projectId);
  return {
    ...result,
    records: result.records || []
  };
}

  @Get('history/:productId/:branchId')
  @Permissions(EPermission.STOCK_ANALYZE)
  async getStockHistory(
    @Param('productId') productId: string,
    @Param('branchId') branchId: string,
    @Query('days') days = '30'
  ) {
    const daysNum = Number(days);
    const safeDays = Number.isFinite(daysNum) && daysNum > 0 ? daysNum : 30;

    return this.stockService.getStockHistory(productId, branchId, safeDays);
  }



  @Get('out-of-stock')
  @Permissions(EPermission.STOCK_ANALYZE)
  async outOfStockSmart(
    @Query('branchId') branchId?: string, 
    @Query('productId') productId?: string,
    @Query('project') project?: string, // ✅ Added project filter
    @Query('threshold') threshold = '0', 
    @Query('export') exportFlag?: string, 
    @Res({ passthrough: true }) res?: any
  ) {
    // if (!branchId) {
    //   throw new BadRequestException('branchId is required');
    // }
  
    const thrNum = Number(threshold);
    const safeThr = Number.isFinite(thrNum) ? thrNum : 0;
  
    const result = await this.stockService.getOutOfStockSmart({
      branchId,
      productId,
      project, // ✅ Pass project to service
      threshold: safeThr,
    });
    
    // 🔄 normalize to flat items (no nested product.stock)
    const flatItems = result.items.map(it => ({
      product_id: it.product?.id ?? null,
      product_name: it.product?.name ?? null,
      sku: it.product?.sku ?? null,
      model: it.product?.model ?? null,
      price: it.product?.price ?? null,
      is_active: it.product?.is_active ?? null,
      project: it.product?.project ?? null, // ✅ Added project to flat items
  
      // per-branch only; aggregate => null
      branch_id: result.mode === 'per-branch' ? (it.branch?.id ?? null) : null,
      branch_name: result.mode === 'per-branch' ? (it.branch?.name ?? null) : null,
  
      // quantity = stock.quantity (per-branch) OR total_qty (aggregate)
      quantity: it.quantity,
    }));
  
    const payload = {
      mode: result.mode, // 'aggregate' | 'per-branch'
      threshold: result.threshold, // number
      branchId: result.branchId?? null,
      productId: result.productId ?? null,
      project: result.project ?? null, // ✅ Added project to payload
      items: flatItems,
      count: flatItems.length,
    };
  
    // export => Excel
    const shouldExport = typeof exportFlag === 'string' && ['true', '1', 'yes'].includes(exportFlag.toLowerCase());
  
    if (shouldExport) {
      await this.exportService.exportRowsToExcel(res, flatItems, {
        sheetName: 'out_of_stock',
        fileName: productId ? 'out_of_stock_per_branch' : 'out_of_stock_aggregate',
        columns: [
          { header: 'mode', key: 'mode', width: 14 },
          { header: 'branch_id', key: 'branch_id', width: 24 },
          { header: 'branch_name', key: 'branch_name', width: 28 },
          { header: 'product_id', key: 'product_id', width: 24 },
          { header: 'product_name', key: 'product_name', width: 32 },
          { header: 'sku', key: 'sku', width: 18 },
          { header: 'model', key: 'model', width: 18 },
          { header: 'price', key: 'price', width: 14 },
          { header: 'is_active', key: 'is_active', width: 12 },
          { header: 'project', key: 'project', width: 20 }, // ✅ Added project column
          { header: 'quantity', key: 'quantity', width: 14 },
          { header: 'threshold', key: 'threshold', width: 14 },
          { header: 'filter_branchId', key: 'filter_branchId', width: 24 },
          { header: 'filter_productId', key: 'filter_productId', width: 24 },
          { header: 'filter_project', key: 'filter_project', width: 24 }, // ✅ Added project filter column
        ],
      });
      return; // stream ended
    }
  
    // JSON response (flat, clean)
    return payload;
  }

  @Get(':id')
  @Permissions(EPermission.STOCK_READ)
  async getById(@Param('id') id: string) {
    return this.stockService.getById(id);
  }
  // Create a utility to get valid relations
 getValidRelations(repository: any, requestedRelations: string[]): string[] {
  const validRelations: string[] = [];
  const entityRelations = repository.metadata.relations.map((r: any) => r.propertyName);

  requestedRelations.forEach(relation => {
    if (relation.includes('.')) {
      // For nested relations, check if the first part exists
      const firstLevelRelation = relation.split('.')[0];
      if (entityRelations.includes(firstLevelRelation)) {
        validRelations.push(relation);
      }
    } else {
      // For direct relations
      if (entityRelations.includes(relation)) {
        validRelations.push(relation);
      }
    }
  });

  return validRelations;
}
}