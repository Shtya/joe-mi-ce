import { Controller, Post, Body, Get, Param, Patch, Delete, UseGuards, Query, BadRequestException, Res, Req } from '@nestjs/common';
import { StockService } from './stock.service';
import { CreateStockDto, UpdateStockDto } from 'dto/stock.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { PaginationQueryDto } from 'dto/pagination.dto';
import { CRUD } from 'common/crud.service';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { ExportService } from 'src/export/export.service';

@UseGuards(AuthGuard)
@Controller('stock')
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly exportService: ExportService,
  ) {}

  @Get('project/:projectId')
  @Permissions(EPermission.STOCK_READ)
  async getProjectStocks(@Req() req, @Param('projectId') projectId?: string, @Query() query?: any,@Query('search') search?: string, @Query('page') page: any = 1, @Query('limit') limit: any = 10, @Query('sortBy') sortBy?: string, @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'DESC') {
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

  @Patch(':id')
  @Permissions(EPermission.STOCK_UPDATE)
  async updateOne(@Param('id') id: string, @Body() dto: UpdateStockDto) {
    return this.stockService.updateOne(id, dto);
  }

  @Get('product/:productId')
  @Permissions(EPermission.STOCK_READ)
  getStocksByProduct(@Param('productId') productId: string) {
    return this.stockService.getStocksByProduct(productId);
  }

  @Get('branch/:branchId')
  @Permissions(EPermission.STOCK_READ)
  getStocksByBranch(@Param('branchId') branchId: string) {
    return this.stockService.getStocksByBranch(branchId);
  }

  @Get('out-of-stock')
  @Permissions(EPermission.STOCK_ANALYZE)
  async outOfStockSmart(@Query('branchId') branchId?: string, @Query('productId') productId?: string, @Query('threshold') threshold = '0', @Query('export') exportFlag?: string, @Res({ passthrough: true }) res?: any) {
    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }

    const thrNum = Number(threshold);
    const safeThr = Number.isFinite(thrNum) ? thrNum : 0;

    const result = await this.stockService.getOutOfStockSmart({
      branchId,
      productId,
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

      // per-branch only; aggregate => null
      branch_id: result.mode === 'per-branch' ? (it.branch?.id ?? null) : null,
      branch_name: result.mode === 'per-branch' ? (it.branch?.name ?? null) : null,

      // quantity = stock.quantity (per-branch) OR total_qty (aggregate)
      quantity: it.quantity,
    }));

    const payload = {
      mode: result.mode, // 'aggregate' | 'per-branch'
      threshold: result.threshold, // number
      branchId: result.branchId ?? null,
      productId: result.productId ?? null,
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
          { header: 'mode', key: 'mode', width: 14 }, // optional: add mode if you like
          { header: 'branch_id', key: 'branch_id', width: 24 },
          { header: 'branch_name', key: 'branch_name', width: 28 },
          { header: 'product_id', key: 'product_id', width: 24 },
          { header: 'product_name', key: 'product_name', width: 32 },
          { header: 'sku', key: 'sku', width: 18 },
          { header: 'model', key: 'model', width: 18 },
          { header: 'price', key: 'price', width: 14 },
          { header: 'is_active', key: 'is_active', width: 12 },
          { header: 'quantity', key: 'quantity', width: 14 },
          { header: 'threshold', key: 'threshold', width: 14 }, // optional: add static threshold/filters if needed
          { header: 'filter_branchId', key: 'filter_branchId', width: 24 },
          { header: 'filter_productId', key: 'filter_productId', width: 24 },
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
}
