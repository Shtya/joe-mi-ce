// sales-target.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThanOrEqual, Between, In } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { SalesTarget, SalesTargetType, SalesTargetStatus } from '../../entities/sales-target.entity';
import { Branch } from '../../entities/branch.entity';
import { CreateSalesTargetDto, UpdateSalesTargetDto, UpdateSalesProgressDto } from '../../dto/sales-target.dto';

@Injectable()
export class SalesTargetService {
  private readonly logger = new Logger(SalesTargetService.name);

  constructor(
    @InjectRepository(SalesTarget)
    public readonly salesTargetRepository: Repository<SalesTarget>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}
  private get3MonthPeriod(date: Date = new Date()) {
    const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
    const endDate = new Date(date.getFullYear(), date.getMonth() + 3, 0);
    return { startDate, endDate };
  }
  async create(createDto: CreateSalesTargetDto, createdBy?: string): Promise<SalesTarget[]> {
    const branchIds = createDto.branchIds?.length
      ? createDto.branchIds
      : createDto.branchId
        ? [createDto.branchId]
        : [];

    if (!branchIds.length) throw new BadRequestException('Either branchId or branchIds must be provided');

    const branches = await this.branchRepository.find({ where: { id: In(branchIds) } });
    if (branches.length !== branchIds.length) {
      const missingIds = branchIds.filter(id => !branches.map(b => b.id).includes(id));
      throw new NotFoundException(`Branches not found: ${missingIds.join(', ')}`);
    }

    const targetType = createDto.type || SalesTargetType.QUARTERLY;
    const { startDate, endDate } = this.get3MonthPeriod();

    const salesTargets: SalesTarget[] = [];

    for (const branch of branches) {
      const targetName = createDto.name || `${branch.name} - ${targetType} Target - ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
      const description = createDto.description || `${targetType} sales target for ${branch.name} from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
      const targetAmount = createDto.targetAmount ?? branch.defaultSalesTargetAmount ?? 0;

      const existingTarget = await this.salesTargetRepository.findOne({
        where: {
          branch: { id: branch.id },
          type: targetType,
          startDate,
          endDate,
        },
      });
      if (existingTarget) throw new BadRequestException(`Active ${targetType} target already exists for branch ${branch.name}`);

      const salesTarget = this.salesTargetRepository.create({
        ...createDto,
        name: targetName,
        description,
        startDate,
        endDate,
        targetAmount,
        currentAmount: 0,
        status: SalesTargetStatus.ACTIVE,
        type: targetType,
        branch,
        createdBy: createdBy ? { id: createdBy } : null,
      });

      salesTargets.push(salesTarget);
    }

    return await this.salesTargetRepository.save(salesTargets);
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
    const { startDate, endDate } = this.get3MonthPeriod();
    const targetAmount = branch.defaultSalesTargetAmount || 0;
    const targetName = `${targetType} Sales - ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;

    const newTarget = this.salesTargetRepository.create({
      name: targetName,
      type: targetType,
      targetAmount,
      startDate,
      endDate,
      branch,
      autoRenew: branch.autoCreateSalesTargets,
      status: SalesTargetStatus.ACTIVE,
      currentAmount: 0,
    });

    return await this.salesTargetRepository.save(newTarget);
  }

  /** Cron job runs on 1st day of every month at 2:00 AM */
  @Cron('0 2 1 * *')
  async handleAllTargets() {
    this.logger.log('Processing expired sales targets...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

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

    for (const target of expiredTargets) {
      target.status = SalesTargetStatus.EXPIRED;
      await this.salesTargetRepository.save(target);

      if (target.autoRenew && target.branch.autoCreateSalesTargets) {
        await this.createNewSalesTarget(target.branch, target.type);
        this.logger.log(`Created new ${target.type} sales target for branch ${target.branch.name}`);
      }
    }

    await this.initializeMissingTargets();
  }

  // Initialize missing targets for branches with auto-create enabled
  async initializeMissingTargets(): Promise<void> {
    this.logger.log('Checking branches without current targets...');

    const branches = await this.branchRepository.find({ where: { autoCreateSalesTargets: true } });
    let createdCount = 0;

    for (const branch of branches) {
      const currentTarget = await this.getCurrentTarget(branch.id);
      if (!currentTarget) {
        await this.createNewSalesTarget(branch, branch.salesTargetType);
        createdCount++;
        this.logger.log(`Created initial ${branch.salesTargetType} sales target for branch: ${branch.name}`);
      }
    }

    if (createdCount > 0) this.logger.log(`Created ${createdCount} initial sales targets`);
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