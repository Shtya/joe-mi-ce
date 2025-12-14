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
import { LessThanOrEqual } from 'typeorm';

@UseGuards(AuthGuard)
@Controller('stock')
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly exportService: ExportService,
  ) {}
// Add these to your StockController class

// Add these to your StockController class

@Get('mobile/stocks/:branchId')
@UseGuards(AuthGuard)
async getStocksByUserBranchMobile(
  @Req() req: any,
  @Param("branchId") branchId:any,
  @Query('search') search?: string,
  @Query('page') page: any = 1,
  @Query('limit') limit: any = 10,
  @Query('sortBy') sortBy?: string,
  @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC',
  @Query() filters?: any
) {
  const userId = req.user.id;
  return this.stockService.getStocksByUserBranchMobile(
    userId, branchId,search, page, limit, sortBy, sortOrder, filters
  );
}

@Post('mobile/stocks')
@UseGuards(AuthGuard)
async createStockMobile(
  @Req() req: any,

  @Body() createStockDto: CreateStockDto
) {
  const userId = req.user.id;
  return this.stockService.createStockMobile(userId, createStockDto);
}

@Patch('mobile/stocks/:id')
@UseGuards(AuthGuard)
async updateStockMobile(
  @Req() req: any,
  @Param('id') stockId: string,
  @Body() updateStockDto: UpdateStockDto
) {
  const userId = req.user.id;
  return this.stockService.updateStockMobile(userId, stockId, updateStockDto);
}

@Delete('mobile/stocks/:id')
@UseGuards(AuthGuard)
async deleteStockMobile(
  @Req() req: any,
  @Param('id') stockId: string
) {
  const userId = req.user.id;
  return this.stockService.deleteStockMobile(userId, stockId);
}
@Get('mobile/out-of-stock/:branchId')
@UseGuards(AuthGuard)
async getOutOfStockByUserBranchMobile(
  @Req() req: any,
  @Param("branchId") branchId,
  @Query('threshold') threshold = '0',
  @Query('search') search?: string,
  @Query('page') page: any = 1,
  @Query('limit') limit: any = 10,
  @Query('sortBy') sortBy?: string,
  @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'ASC',
  @Query() filters?: any
) {
  const userId = req.user.id;
  const thresholdNum = Number(threshold) || 0;
  return this.stockService.getOutOfStockByUserBranchMobile(
    userId, branchId,thresholdNum, search, page, limit, sortBy, sortOrder, filters
  );
}
  @Get('project/:projectId')
  @Permissions(EPermission.STOCK_READ)
  async getProjectStocks(@Req() req, @Param('projectId') projectId?: string, @Query() query?: any, @Query('search') search?: string, @Query('page') page: any = 1, @Query('limit') limit: any = 10, @Query('sortBy') sortBy?: string, @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC') {
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
      query,
    });
  }
  @Get('project/:projectId')
  @Permissions(EPermission.STOCK_READ)
  async getPromoterStocks(@Req() req, @Param('projectId') projectId?: string, @Query() query?: any, @Query('search') search?: string, @Query('page') page: any = 1, @Query('limit') limit: any = 10, @Query('sortBy') sortBy?: string, @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC') {
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
      query,
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
  async getStocksByProduct(@Param('productId') productId: string, @Query() query?: any, @Query('search') search?: string, @Query('page') page: any = 1, @Query('limit') limit: any = 10, @Query('sortBy') sortBy?: string, @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC') {
    return this.stockService.getStocksByProduct(productId, search, page, limit, sortBy, sortOrder, query?.filters);
  }

  @Get('by-branch/:branchId')
  @Permissions(EPermission.STOCK_READ)
  async getStocksByBranch(@Param('branchId') branchId: string, @Query() query?: any, @Query('search') search?: string, @Query('page') page: any = 1, @Query('limit') limit: any = 10, @Query('sortBy') sortBy?: string, @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC') {
    return this.stockService.getStocksByBranch(branchId, search, page, limit, sortBy, sortOrder, query?.filters);
  }
  @Get('low-stock-alerts')
  @Permissions(EPermission.STOCK_READ)
  async getLowStockAlertsOptimized(@Query('threshold') threshold: number = 10, @Query('projectId') projectId?: string) {
    const result = await this.stockService.getLowStockAlerts(threshold, projectId);
    return {
      ...result,
      records: result.records || [],
    };
  }

  @Get('history/:productId/:branchId')
  @Permissions(EPermission.STOCK_ANALYZE)
  async getStockHistory(@Param('productId') productId: string, @Param('branchId') branchId: string, @Query('days') days = '30') {
    const daysNum = Number(days);
    const safeDays = Number.isFinite(daysNum) && daysNum > 0 ? daysNum : 30;

    return this.stockService.getStockHistory(productId, branchId, safeDays);
  }
  normalizeFilters(filters: any) {
    const out: any = { ...filters };

    const mapKey = (shortKey: string, targetKey: string) => {
      if (filters[shortKey]) {
        out.product = {
          ...(out.product || {}),
          [targetKey]: {
            ...(out.product?.[targetKey] || {}),
            ...filters[shortKey],
          },
        };
        delete out[shortKey];
      }
    };

    mapKey('brand', 'brand'); // filters[brand]     -> filters[product][brand]
    mapKey('category', 'category'); // filters[category]  -> filters[product][category]

    return out;
  }
  @Get('out-of-stock')
  @Permissions(EPermission.STOCK_ANALYZE)
  async outOfStockSmart(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC',
    @Query('search') search?: string,
    @Query('filters') filtersQuery?: Record<string, any>,
    @Query('threshold') threshold = '0',

    @Query('export') exportFlag?: string,
    @Res({ passthrough: true }) res?: any,
  ) {
    const thrNum = Number(threshold);
    const safeThr = Number.isFinite(thrNum) ? thrNum : 0;
    let filters: Record<string, any> = filtersQuery && typeof filtersQuery === 'object' ? { ...filtersQuery } : {};

    filters = this.normalizeFilters(filters);
    if (req.user?.project?.id) {
      filters.branch = {
        ...(filters.branch || {}),
        project: { id: req.user.project.id },
      };
    }

if (safeThr >= 0 && filters.quantity_to === undefined) {
  console.log('Applying quantity filter for out-of-stock:', safeThr);
  filters.quantity = LessThanOrEqual(safeThr);
}
    const list = await CRUD.findAllRelation(this.stockService.stockRepo, 'stock', search, page, limit, sortBy, sortOrder, ['product', 'product.category', 'product.brand', 'branch', 'branch.project'], undefined, filters);

    // 🔄 flatten for response / export
    const flatItems = (list.records as any[]).map(it => ({
      product_id: it.product?.id ?? null,
      product_name: it.product?.name ?? null,
      sku: it.product?.sku ?? null,
      model: it.product?.model ?? null,
      price: it.product?.price ?? null,
      is_active: it.product?.is_active ?? null,
      project: it.product?.project ?? null,
      category_name: it.product?.category?.name ?? null,
      brand_name: it.product?.brand?.name ?? null,

      branch_id: it.branch?.id ?? null,
      branch_name: it.branch?.name ?? null,
      quantity: it.quantity,
      created_at: it.created_at,
    }));

    const shouldExport = typeof exportFlag === 'string' && ['true', '1', 'yes'].includes(exportFlag.toLowerCase());

    if (shouldExport) {
      const rowsForExport = flatItems.map(row => ({
        ...row,
        threshold: safeThr,
        filter_threshold: safeThr,
      }));



      return;
    }
    return list;
  }

  // @Get('mobile/out-of-stock')
  // @Permissions(EPermission.STOCK_ANALYZE)
  // async outOfStockSmartMobile(@Query('branchId') branchId?: string, @Query('productId') productId?: string, @Query('project') project?: string, @Query('threshold') threshold = '0', @Query('export') exportFlag?: string, @Res({ passthrough: true }) res?: any) {
  //   const thrNum = Number(threshold);
  //   const safeThr = Number.isFinite(thrNum) ? thrNum : 0;

  //   const result = await this.stockService.getOutOfStockSmart({
  //     branchId,
  //     productId,
  //     project,
  //     threshold: safeThr,
  //   });

  //   const flatItems = result.items.map(it => ({
  //     product_id: it.product?.id ?? null,
  //     product_name: it.product?.name ?? null,
  //     sku: it.product?.sku ?? null,
  //     model: it.product?.model ?? null,
  //     price: it.product?.price ?? null,
  //     is_active: it.product?.is_active ?? null,
  //     project: it.product?.project ?? null,

  //     branch_id: result.mode === 'per-branch' ? (it.branch?.id ?? null) : null,
  //     branch_name: result.mode === 'per-branch' ? (it.branch?.name ?? null) : null,

  //     quantity: it.quantity,
  //   }));

  //   const payload = {
  //     mode: result.mode,
  //     threshold: result.threshold,
  //     branchId: result.branchId ?? null,
  //     productId: result.productId ?? null,
  //     project: result.project ?? null,
  //     items: flatItems,
  //     count: flatItems.length,
  //   };

  //   const shouldExport = typeof exportFlag === 'string' && ['true', '1', 'yes'].includes(exportFlag.toLowerCase());

  //   if (shouldExport) {
  //     await this.exportService.exportRowsToExcel(res, flatItems, {
  //       sheetName: 'out_of_stock',
  //       fileName: productId ? 'out_of_stock_per_branch' : 'out_of_stock_aggregate',
  //       columns: [
  //         { header: 'mode', key: 'mode', width: 14 },
  //         { header: 'branch_id', key: 'branch_id', width: 24 },
  //         { header: 'branch_name', key: 'branch_name', width: 28 },
  //         { header: 'product_id', key: 'product_id', width: 24 },
  //         { header: 'product_name', key: 'product_name', width: 32 },
  //         { header: 'sku', key: 'sku', width: 18 },
  //         { header: 'model', key: 'model', width: 18 },
  //         { header: 'price', key: 'price', width: 14 },
  //         { header: 'is_active', key: 'is_active', width: 12 },
  //         { header: 'project', key: 'project', width: 20 },
  //         { header: 'quantity', key: 'quantity', width: 14 },
  //         { header: 'threshold', key: 'threshold', width: 14 },
  //         { header: 'filter_branchId', key: 'filter_branchId', width: 24 },
  //         { header: 'filter_productId', key: 'filter_productId', width: 24 },
  //         { header: 'filter_project', key: 'filter_project', width: 24 },
  //       ],
  //     });
  //     return;
  //   }

  //   return payload;
  // }

  @Get(':id')
  @Permissions(EPermission.STOCK_READ)
  async getById(@Param('id') id: string) {
    return this.stockService.getById(id);
  }

  getValidRelations(repository: any, requestedRelations: string[]): string[] {
    const validRelations: string[] = [];
    const entityRelations = repository.metadata.relations.map((r: any) => r.propertyName);

    requestedRelations.forEach(relation => {
      if (relation.includes('.')) {
        const firstLevelRelation = relation.split('.')[0];
        if (entityRelations.includes(firstLevelRelation)) {
          validRelations.push(relation);
        }
      } else {
        if (entityRelations.includes(relation)) {
          validRelations.push(relation);
        }
      }
    });

    return validRelations;
  }
}
