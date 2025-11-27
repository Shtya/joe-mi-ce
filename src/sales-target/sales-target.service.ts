// sales-target.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThanOrEqual, Between } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { SalesTarget, SalesTargetType, SalesTargetStatus } from '../../entities/sales-target.entity';
import { Branch } from '../../entities/branch.entity';
import { CreateSalesTargetDto, UpdateSalesTargetDto, UpdateSalesProgressDto } from '../../dto/sales-target.dto';

@Injectable()
export class SalesTargetService {
  private readonly logger = new Logger(SalesTargetService.name);

  constructor(
    @InjectRepository(SalesTarget)
    private readonly salesTargetRepository: Repository<SalesTarget>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  async create(createDto: CreateSalesTargetDto, createdBy?: string): Promise<SalesTarget> {
    const branch = await this.branchRepository.findOne({ 
      where: { id: createDto.branchId } 
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const salesTarget = this.salesTargetRepository.create({
      ...createDto,
      branch,
      createdBy: createdBy ? { id: createdBy } : null,
    });

    return await this.salesTargetRepository.save(salesTarget);
  }

  async findAll(query: any = {}): Promise<SalesTarget[]> {
    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.branchId) {
      where.branch = { id: query.branchId };
    }

    if (query.type) {
      where.type = query.type;
    }

    return await this.salesTargetRepository.find({
      where,
      relations: ['branch', 'branch.supervisor', 'createdBy'],
      order: { startDate: 'DESC' },
    });
  }

  async findOne(id: string): Promise<SalesTarget> {
    const salesTarget = await this.salesTargetRepository.findOne({
      where: { id },
      relations: ['branch', 'branch.supervisor', 'createdBy'],
    });

    if (!salesTarget) {
      throw new NotFoundException('Sales target not found');
    }

    return salesTarget;
  }

  async findByBranch(branchId: string, status?: SalesTargetStatus): Promise<SalesTarget[]> {
    const where: any = { branch: { id: branchId } };
    
    if (status) {
      where.status = status;
    }

    return await this.salesTargetRepository.find({
      where,
      relations: ['createdBy'],
      order: { startDate: 'DESC' },
    });
  }

  async getCurrentTarget(branchId: string): Promise<SalesTarget | null> {
    const now = new Date();
    
    return await this.salesTargetRepository.findOne({
      where: {
        branch: { id: branchId },
        startDate: LessThan(now),
        endDate: MoreThanOrEqual(now),
        status: SalesTargetStatus.ACTIVE,
      },
      relations: ['branch', 'createdBy'],
    });
  }

  async update(id: string, updateDto: UpdateSalesTargetDto): Promise<SalesTarget> {
    const salesTarget = await this.findOne(id);
    
    Object.assign(salesTarget, updateDto);
    salesTarget.updateStatus();

    return await this.salesTargetRepository.save(salesTarget);
  }

  async updateProgress(id: string, progressDto: UpdateSalesProgressDto): Promise<SalesTarget> {
    const salesTarget = await this.findOne(id);
    
    salesTarget.currentAmount += progressDto.salesAmount;
    salesTarget.updateStatus();

    return await this.salesTargetRepository.save(salesTarget);
  }

  async delete(id: string): Promise<void> {
    const salesTarget = await this.findOne(id);
    await this.salesTargetRepository.remove(salesTarget);
  }

  async createNewSalesTarget(branch: Branch, targetType: SalesTargetType): Promise<SalesTarget> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    let startDate: Date;
    let endDate: Date;
    let targetName: string;

    if (targetType === SalesTargetType.MONTHLY) {
      // Monthly target: current month (1st to last day)
      startDate = new Date(currentYear, currentMonth, 1);
      endDate = new Date(currentYear, currentMonth + 1, 0); // Last day of current month
      targetName = `Monthly Sales - ${startDate.toLocaleString('default', { month: 'long', year: 'numeric' })}`;
    } else {
      // Quarterly target: current quarter
      const currentQuarter = Math.floor(currentMonth / 3);
      const quarterStartMonth = currentQuarter * 3;
      
      startDate = new Date(currentYear, quarterStartMonth, 1);
      endDate = new Date(currentYear, quarterStartMonth + 3, 0); // Last day of the quarter
      targetName = `Q${currentQuarter + 1} Sales - ${currentYear}`;
    }

    const targetAmount = branch.defaultSalesTargetAmount || 0;

    const newTarget = this.salesTargetRepository.create({
      name: targetName,
      type: targetType,
      targetAmount,
      startDate,
      endDate,
      branch,
      autoRenew: branch.autoCreateSalesTargets,
    });

    return await this.salesTargetRepository.save(newTarget);
  }

  // Single cron job that runs on the 1st day of every month at 2:00 AM
  @Cron('0 2 1 * *') // At 02:00 on day-of-month 1
  async handleAllTargets() {
    this.logger.log('Processing all sales targets (monthly and quarterly)...');
    
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    // Find ALL expired targets (both monthly and quarterly) that ended yesterday
    const expiredTargets = await this.salesTargetRepository.find({
      where: {
        endDate: Between(
          new Date(yesterday.setHours(0, 0, 0, 0)),
          new Date(yesterday.setHours(23, 59, 59, 999))
        ),
        status: SalesTargetStatus.ACTIVE,
      },
      relations: ['branch'],
    });

    let monthlyCount = 0;
    let quarterlyCount = 0;

    for (const target of expiredTargets) {
      // Update status of expired target
      target.status = SalesTargetStatus.EXPIRED;
      await this.salesTargetRepository.save(target);

      // Create new target if auto-renew is enabled
      if (target.autoRenew && target.branch.autoCreateSalesTargets) {
        await this.createNewSalesTarget(target.branch, target.type);
        
        if (target.type === SalesTargetType.MONTHLY) {
          monthlyCount++;
        } else {
          quarterlyCount++;
        }
        
        this.logger.log(`Created new ${target.type} sales target for branch: ${target.branch.name}`);
      }
    }

    this.logger.log(`Processed ${expiredTargets.length} expired targets (${monthlyCount} monthly, ${quarterlyCount} quarterly)`);
    
    // Also create initial targets for branches that don't have current targets
    await this.initializeMissingTargets();
  }

  // Initialize missing targets for branches with auto-create enabled
  async initializeMissingTargets(): Promise<void> {
    this.logger.log('Checking for branches without current sales targets...');
    
    const branches = await this.branchRepository.find({
      where: { autoCreateSalesTargets: true },
    });

    const currentDate = new Date();
    let createdCount = 0;
    
    for (const branch of branches) {
      const currentTarget = await this.getCurrentTarget(branch.id);
      
      if (!currentTarget) {
        // No active target found, create one based on branch's target type
        await this.createNewSalesTarget(branch, branch.salesTargetType);
        createdCount++;
        this.logger.log(`Created initial ${branch.salesTargetType} sales target for branch: ${branch.name}`);
      }
    }

    if (createdCount > 0) {
      this.logger.log(`Created ${createdCount} initial sales targets for branches`);
    }
  }

  // Method to manually trigger target creation for testing
  async manuallyCreateTargetsForDate(targetDate: Date): Promise<void> {
    this.logger.log(`Manually creating targets for date: ${targetDate}`);
    
    const branches = await this.branchRepository.find({
      where: { autoCreateSalesTargets: true },
    });

    for (const branch of branches) {
      // Check if target already exists for this period
      const existingTarget = await this.salesTargetRepository.findOne({
        where: {
          branch: { id: branch.id },
          startDate: LessThan(targetDate),
          endDate: MoreThanOrEqual(targetDate),
        },
      });

      if (!existingTarget) {
        await this.createNewSalesTarget(branch, branch.salesTargetType);
        this.logger.log(`Created manual ${branch.salesTargetType} sales target for branch: ${branch.name}`);
      }
    }
  }

  async getSalesTargetStatistics(branchId?: string) {
    const query = this.salesTargetRepository
      .createQueryBuilder('target')
      .leftJoin('target.branch', 'branch')
      .select([
        'COUNT(target.id) as totalTargets',
        'SUM(CASE WHEN target.status = :active THEN 1 ELSE 0 END) as activeTargets',
        'SUM(CASE WHEN target.status = :completed THEN 1 ELSE 0 END) as completedTargets',
        'SUM(CASE WHEN target.status = :expired THEN 1 ELSE 0 END) as expiredTargets',
'AVG(target.currentAmount / NULLIF(target.targetAmount, 0)) * 100 as averageProgress',
        'SUM(target.targetAmount) as totalTargetAmount',
        'SUM(target.currentAmount) as totalCurrentAmount',
        'SUM(CASE WHEN target.type = :monthly THEN 1 ELSE 0 END) as monthlyTargets',
        'SUM(CASE WHEN target.type = :quarterly THEN 1 ELSE 0 END) as quarterlyTargets',
      ])
      .setParameters({
        active: SalesTargetStatus.ACTIVE,
        completed: SalesTargetStatus.COMPLETED,
        expired: SalesTargetStatus.EXPIRED,
        monthly: SalesTargetType.MONTHLY,
        quarterly: SalesTargetType.QUARTERLY,
      });

    if (branchId) {
      query.where('branch.id = :branchId', { branchId });
    }

    return await query.getRawOne();
  }

  async getBranchPerformance(branchId: string, period: 'month' | 'quarter' | 'year' = 'month') {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    return await this.salesTargetRepository
      .createQueryBuilder('target')
      .where('target.branchId = :branchId', { branchId })
      .andWhere('target.startDate >= :startDate', { startDate })
      .select([
        'target.type as type',
        'SUM(target.targetAmount) as totalTarget',
        'SUM(target.currentAmount) as totalAchieved',
'AVG(target.currentAmount / NULLIF(target.targetAmount, 0)) * 100 as averageProgress',
      ])
      .groupBy('target.type')
      .getRawMany();
  }

  // Get upcoming expirations for dashboard
  async getUpcomingExpirations(days: number = 7): Promise<SalesTarget[]> {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    
    return await this.salesTargetRepository.find({
      where: {
        endDate: Between(startDate, endDate),
        status: SalesTargetStatus.ACTIVE,
      },
      relations: ['branch', 'branch.supervisor'],
      order: { endDate: 'ASC' },
    });
  }
}