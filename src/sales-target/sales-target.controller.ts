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
    Req 
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
  
  @Controller('sales-targets')
  @UsePipes(new ValidationPipe({ transform: true }))
  export class SalesTargetController {
    constructor(private readonly salesTargetService: SalesTargetService) {}
  
    @Post()
    @Permissions(EPermission.BRANCH_CREATE)
    
    async create(
      @Body() createDto: CreateSalesTargetDto,
      @Req() req: any
    ): Promise<SalesTarget> {
      const userId = req.user?.id;
      return await this.salesTargetService.create(createDto, userId);
    }
  
    @Get()
    async findAll(@Query() query: SalesTargetQueryDto): Promise<SalesTarget[]> {
      return await this.salesTargetService.findAll(query);
    }
    @Get('stats/overview')
    async getStatistics(@Query('branchId') branchId?: string) {
      return await this.salesTargetService.getSalesTargetStatistics(branchId);
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
    async getUpcomingExpirations(@Query('days') days: number = 7): Promise<SalesTarget[]> {
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