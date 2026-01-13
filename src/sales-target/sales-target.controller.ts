// sales-target.controller.ts (updated)
import { 
    Controller, 
    Get, 
    Post, 
    Put, 
    Delete, 
    Body, 
    Param, 
    Query, 
    UsePipes, 
    ValidationPipe,
    ParseUUIDPipe,
    Req, 
    DefaultValuePipe,
    ParseIntPipe,
    UseGuards
  } from '@nestjs/common';
  import { SalesTargetService } from './sales-target.service';
  import { SalesTarget, SalesTargetStatus } from '../../entities/sales-target.entity';
  import { 
    CreateSalesTargetDto, 
    UpdateSalesTargetDto, 
    UpdateSalesProgressDto,
    SalesTargetQueryDto 
  } from '../../dto/sales-target.dto';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { CRUD } from 'common/crud.service';
import { AuthGuard } from '../auth/auth.guard';
import { UsersService } from 'src/users/users.service';
;
  
  @Controller('sales-targets')
  
  @UsePipes(new ValidationPipe({ transform: true }))
  @UseGuards(AuthGuard)
  export class SalesTargetController {
    constructor( readonly salesTargetService: SalesTargetService,
      readonly userService:UsersService
    ) {}
  
    @Post()
    @Permissions(EPermission.BRANCH_CREATE)
    
    async create(
      @Body() createDto: CreateSalesTargetDto,
      @Req() req: any
    ): Promise<SalesTarget[]> {
      const userId = req.user?.id;
      return await this.salesTargetService.create(createDto, userId);
    }
  
    @Get()
    async findAll(@Query() query: any,@Req() req:any) {
        console.log('Query params:', query); // Add this to see what you're getting
        const projectId = await this.userService.resolveProjectIdFromUser(req.user.id)
        // Parse filters from query parameters
        const filtersObj = this.parseFiltersFromQuery(query);
        filtersObj['branch.project.id'] = projectId;
        
        return CRUD.findAll2(
            this.salesTargetService.salesTargetRepository,
            'sales_targets',
            query.search,
            query.page,
            query.limit,
            query.sortBy,
            query.sortOrder,
            ['branch', 'branch.supervisor', 'createdBy'],
            ['name', 'created_at'],
            filtersObj
        );
    }
    
    private parseFiltersFromQuery(query: any): Record<string, any> {
        const filters: Record<string, any> = {};
        
        // Check if filters are already in the format you expect
        if (query.filters && typeof query.filters === 'object') {
            return query.filters;
        }
        
        // Parse filters from query parameters like "filters[status]=completed"
        for (const [key, value] of Object.entries(query)) {
            const match = key.match(/^filters\[(.+)\]$/);
            if (match) {
                const filterKey = match[1];
                filters[filterKey] = value;
            }
        }
        
        // Also check for nested filters like "filters[status][eq]=completed"
        for (const [key, value] of Object.entries(query)) {
            const match = key.match(/^filters\[(.+)\]\[(.+)\]$/);
            if (match) {
                const filterKey = match[1];
                const operator = match[2];
                
                if (!filters[filterKey]) {
                    filters[filterKey] = {};
                }
                
                // Handle different operator formats
                if (operator === 'eq' || operator === 'ne' || operator === 'gt' || 
                    operator === 'gte' || operator === 'lt' || operator === 'lte' ||
                    operator === 'like' || operator === 'ilike') {
                    filters[filterKey] = value;
                } else {
                    // For complex operators, create nested structure
                    if (typeof filters[filterKey] !== 'object') {
                        filters[filterKey] = {};
                    }
                    filters[filterKey][operator] = value;
                }
            }
        }
        
        return filters;
    }
    @Get('stats/overview')
    async getStatistics(@Req() req:any,@Query('branchId') branchId?: string) {
      const projectId = await this.userService.resolveProjectIdFromUser(req.user.id)
      return await this.salesTargetService.getSalesTargetStatistics(branchId,projectId);
    }
  
    @Get('branch/:branchId/performance')
    async getBranchPerformance(
      @Param('branchId', ParseUUIDPipe) branchId: string,
      @Query('period') period: 'month' | 'quarter' | 'year' = 'month'
    ) {
      return await this.salesTargetService.getBranchPerformance(branchId, period);
    }
    @Get('branch/:branchId')
    async findByBranch(
      @Param('branchId', ParseUUIDPipe) branchId: string,
      @Query('status') status?: SalesTargetStatus
    ): Promise<SalesTarget[]> {
      return await this.salesTargetService.findByBranch(branchId, status);
    }
  
    @Get('branch/:branchId/current')
    async getCurrentTarget(
      @Param('branchId', ParseUUIDPipe) branchId: string
    ): Promise<SalesTarget | null> {
      return await this.salesTargetService.getCurrentTarget(branchId);
    }
    @Get('upcoming-expirations')
    async getUpcomingExpirations(  @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
): Promise<SalesTarget[]> {
      return await this.salesTargetService.getUpcomingExpirations(days);
    }
  
    @Get('cron/test')
    async testCronJob(): Promise<{ message: string }> {
  
      await this.salesTargetService.handleAllTargets();
      return { message: 'Cron job logic executed successfully' };
    }

    @Get(':id')
    async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SalesTarget> {
      return await this.salesTargetService.findOne(id);
    }
  
    @Put(':id')
    async update(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() updateDto: UpdateSalesTargetDto
    ): Promise<SalesTarget> {
      return await this.salesTargetService.update(id, updateDto);
    }
  
    @Put(':id/progress')
    async updateProgress(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() progressDto: UpdateSalesProgressDto
    ): Promise<SalesTarget> {
      return await this.salesTargetService.updateProgress(id, progressDto);
    }
  
    @Delete(':id')
    async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
      return await this.salesTargetService.delete(id);
    }
  

  
    // NEW ENDPOINTS
    @Post('initialize-missing')
    async initializeMissingTargets(): Promise<{ message: string }> {
      await this.salesTargetService.initializeMissingTargets();
      return { message: 'Missing targets initialization completed' };
    }
  
    @Post('create-for-date')
    async createTargetsForDate(@Body() body: { targetDate: string }): Promise<{ message: string }> {
      const targetDate = new Date(body.targetDate);
      await this.salesTargetService.manuallyCreateTargetsForDate(targetDate);
      return { message: 'Targets created for specified date' };
    }
  

  }