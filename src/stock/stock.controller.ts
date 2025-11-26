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
  @Permissions(EPermission.STOCK_READ)
  async outOfStockSmart(@Query() query: any) {
    // Parse the filter format from query parameters
    const filters = this.parseFilters(query);
    
    const outOfStockQuery: any = {
      page: query.page ? Number(query.page) : 1,
      limit: query.limit ? Number(query.limit) : 10,
      search: query.search,
      sortBy: query.sortBy || 'quantity',
      sortOrder: (query.sortOrder as 'ASC' | 'DESC') || 'ASC',
      filters
    };
  
    return await this.stockService.getOutOfStockSmart(outOfStockQuery);
  }
  
  private parseFilters(query: any): Record<string, any> {
    const filters: Record<string, any> = {};
  
    Object.keys(query).forEach(key => {
      if (key.startsWith('filters[')) {
        const match = key.match(/filters\[([^\]]+)\]/);
        if (match) {
          const fieldPath = match[1];
          
          // Handle nested filters like filters[product][project][id]
          if (fieldPath.includes('][')) {
            const fieldParts = fieldPath.split('][');
            let currentLevel = filters;
            
            fieldParts.forEach((part, index) => {
              if (index === fieldParts.length - 1) {
                currentLevel[part] = query[key];
              } else {
                currentLevel[part] = currentLevel[part] || {};
                currentLevel = currentLevel[part];
              }
            });
          } else {
            // Simple filter like filters[threshold]
            filters[fieldPath] = query[key];
          }
        }
      }
    });
  
    return filters;
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