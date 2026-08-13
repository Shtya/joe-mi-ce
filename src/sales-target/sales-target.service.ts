// sales-target.service.ts
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  Repository,
  LessThan,
  MoreThanOrEqual,
  Between,
  In,
  LessThanOrEqual,
} from "typeorm";
import { Cron } from "@nestjs/schedule";
import {
  SalesTarget,
  SalesTargetType,
  SalesTargetStatus,
  SalesTargetMetricType,
} from "../../entities/sales-target.entity";
import { Branch } from "../../entities/branch.entity";
import { Sale } from "entities/products/sale.entity";
import { Brand } from "entities/products/brand.entity";
import { Journey } from "entities/all_plans.entity";
import { User } from "entities/user.entity";
import { BrandAssignmentMode } from "enums/BrandAssignmentMode.enum";
import {
  CreateSalesTargetDto,
  UpdateSalesTargetDto,
  UpdateSalesProgressDto,
} from "../../dto/sales-target.dto";

@Injectable()
export class SalesTargetService {
  private readonly logger = new Logger(SalesTargetService.name);

  constructor(
    @InjectRepository(SalesTarget)
    public readonly salesTargetRepository: Repository<SalesTarget>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(Brand)
    private readonly brandRepository: Repository<Brand>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}
  private getMonthPeriod(date: Date = new Date()) {
    const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
    const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { startDate, endDate };
  }
  private get3MonthPeriod(date: Date = new Date()) {
    const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
    const endDate = new Date(date.getFullYear(), date.getMonth() + 3, 0);
    return { startDate, endDate };
  }
  async create(
    createDto: CreateSalesTargetDto,
    createdBy?: string,
  ): Promise<SalesTarget[]> {
    const branchIds = createDto.branchIds?.length
      ? createDto.branchIds
      : createDto.branchId
        ? createDto.branchId
        : [];

    if (!branchIds.length) {
      throw new BadRequestException(
        "Either branchId or branchIds must be provided",
      );
    }

    const branches = await this.branchRepository.find({
      where: { id: In(branchIds) },
      relations: ["project"],
    });
    if (branches.length !== branchIds.length) {
      const missingIds = branchIds.filter(
        (id) => !branches.map((b) => b.id).includes(id),
      );
      throw new NotFoundException(
        `Branches not found: ${missingIds.join(", ")}`,
      );
    }

    const targetType = createDto.type || SalesTargetType.QUARTERLY;
    let startDate: Date, endDate: Date;
    if (targetType === SalesTargetType.MONTHLY) {
      startDate = this.getMonthPeriod().startDate;
      endDate = this.getMonthPeriod().endDate;
    } else {
      startDate = this.get3MonthPeriod().startDate;
      endDate = this.get3MonthPeriod().endDate;
    }

    const salesTargets: SalesTarget[] = [];

    for (const branch of branches) {
      let brands: Brand[] = [];
      const brandIds = [
        ...new Set([
          ...(createDto.brandIds || []),
          ...(createDto.brandId ? [createDto.brandId] : []),
        ]),
      ];
      if (brandIds.length) {
        brands = await this.brandRepository.find({
          where: {
            id: In(brandIds),
            project: { id: branch.project.id },
          },
        });

        if (brands.length !== brandIds.length) {
          const foundIds = brands.map((b) => b.id);
          const missingIds = brandIds.filter((id) => !foundIds.includes(id));
          throw new NotFoundException(
            `Brands not found in branch project: ${missingIds.join(", ")}`,
          );
        }
      }

      const metricType =
        createDto.metricType || SalesTargetMetricType.AMOUNT;
      const targetName =
        createDto.name ||
        `${branch.name} - ${targetType} Target - ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
      const description =
        createDto.description ||
        `${targetType} sales target for ${branch.name} from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
      const targetAmount =
        createDto.targetAmount ?? branch.defaultSalesTargetAmount ?? 0;
      const targetQuantity = createDto.targetQuantity ?? 0;
      const targetBrands = createDto.targetBrands ?? 0;

      if (
        metricType === SalesTargetMetricType.QUANTITY &&
        createDto.targetQuantity === undefined
      ) {
        throw new BadRequestException(
          "targetQuantity is required when metricType is quantity",
        );
      }

      const existingTarget = await this.salesTargetRepository.findOne({
        where: {
          branch: { id: branch.id },
          type: targetType,
          startDate,
          endDate,
        },
      });
      if (existingTarget) {
        throw new BadRequestException(
          `Active ${targetType} target already exists for branch ${branch.name}`,
        );
      }

      const salesTarget = this.salesTargetRepository.create({
        ...createDto,
        name: targetName,
        description,
        startDate,
        endDate,
        targetAmount,
        targetQuantity,
        targetBrands,
        currentAmount: 0,
        metricType,
        status: SalesTargetStatus.ACTIVE,
        type: targetType,
        branch,
        project: branch.project,
        brands,
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
      relations: ["branch", "branch.supervisor", "createdBy", "brands"],
      order: { startDate: "DESC" },
    });
  }

  async findOne(id: string): Promise<SalesTarget> {
    const salesTarget = await this.salesTargetRepository.findOne({
      where: { id },
      relations: ["branch", "branch.supervisor", "createdBy", "brands"],
    });

    if (!salesTarget) {
      throw new NotFoundException("Sales target not found");
    }

    return salesTarget;
  }

  async findByBranch(
    branchId: string,
    status?: SalesTargetStatus,
  ): Promise<SalesTarget[]> {
    const where: any = { branch: { id: branchId } };

    if (status) {
      where.status = status;
    }

    return await this.salesTargetRepository.find({
      where,
      relations: ["createdBy", "brands"],
      order: { startDate: "DESC" },
    });
  }
  async getCurrentTarget(branchId: string): Promise<SalesTarget | null> {
    const now = new Date();
    const today = now.toISOString().split("T")[0]; // YYYY-MM-DD

    return await this.salesTargetRepository.findOne({
      where: {
        branch: { id: branchId },
        startDate: LessThanOrEqual(today as any),
        endDate: MoreThanOrEqual(today as any),
        status: SalesTargetStatus.ACTIVE,
      },
      relations: ["branch", "createdBy", "brands"],
    });
  }
  async update(
    id: string,
    updateDto: UpdateSalesTargetDto,
  ): Promise<SalesTarget> {
    const salesTarget = await this.findOne(id);

    if (updateDto.brandIds !== undefined || updateDto.brandId !== undefined) {
      const requestedBrandIds = [
        ...new Set([
          ...(updateDto.brandIds || []),
          ...(updateDto.brandId ? [updateDto.brandId] : []),
        ]),
      ];

      if (requestedBrandIds.length) {
        const brands = await this.brandRepository.find({
          where: {
            id: In(requestedBrandIds),
            project: { id: salesTarget.branch.project.id },
          },
        });

        if (brands.length !== requestedBrandIds.length) {
          const foundIds = brands.map((b) => b.id);
          const missingIds = requestedBrandIds.filter(
            (id) => !foundIds.includes(id),
          );
          throw new NotFoundException(
            `Brands not found in branch project: ${missingIds.join(", ")}`,
          );
        }

        salesTarget.brands = brands;
      } else {
        salesTarget.brands = [];
      }
    }

    const { brandIds, brandId, ...rest } = updateDto;
    Object.assign(salesTarget, rest);
    salesTarget.updateStatus();

    return await this.salesTargetRepository.save(salesTarget);
  }

  async updateProgress(
    id: string,
    progressDto: UpdateSalesProgressDto,
  ): Promise<SalesTarget> {
    const salesTarget = await this.findOne(id);

    salesTarget.currentAmount += progressDto.salesAmount;
    salesTarget.updateStatus();

    return await this.salesTargetRepository.save(salesTarget);
  }

  async delete(id: string): Promise<void> {
    const salesTarget = await this.findOne(id);
    await this.salesTargetRepository.remove(salesTarget);
  }
  async createNewSalesTarget(
    branch: Branch,
    targetType: SalesTargetType,
  ): Promise<SalesTarget> {
    let startDate: Date, endDate: Date;
    if (targetType === SalesTargetType.MONTHLY) {
      startDate = this.getMonthPeriod().startDate;
      endDate = this.getMonthPeriod().endDate;
    } else {
      startDate = this.get3MonthPeriod().startDate;
      endDate = this.get3MonthPeriod().endDate;
    }
    const targetAmount = branch.defaultSalesTargetAmount || 0;
    const targetName = `${targetType} Sales - ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;

    const newTarget = this.salesTargetRepository.create({
      name: targetName,
      type: targetType,
      targetAmount,
      targetQuantity: 0,
      targetBrands: 0,
      metricType: SalesTargetMetricType.AMOUNT,
      startDate,
      endDate,
      branch,
      project: branch.project,
      autoRenew: branch.autoCreateSalesTargets,
      status: SalesTargetStatus.ACTIVE,
      currentAmount: 0,
      brands: [],
    });

    return await this.salesTargetRepository.save(newTarget);
  }

  async getTargetAchievementMetrics(target: SalesTarget): Promise<{
    currentAmount: number;
    currentQuantity: number;
    currentBrands: number;
    amountProgress: number;
    quantityProgress: number;
    brandsProgress: number;
  }> {
    const brandIds = target.brands?.map((brand) => brand.id) || [];

    const salesAgg = this.saleRepository
      .createQueryBuilder("sale")
      .leftJoin("sale.product", "product")
      .select("COALESCE(SUM(sale.total_amount), 0)", "currentAmount")
      .addSelect("COALESCE(SUM(sale.quantity), 0)", "currentQuantity")
      .addSelect("COUNT(DISTINCT product.brand_id)", "currentBrands")
      .where("sale.branchId = :branchId", { branchId: target.branch.id })
      .andWhere("DATE(sale.sale_date) BETWEEN :startDate AND :endDate", {
        startDate: target.startDate,
        endDate: target.endDate,
      });

    if (brandIds.length) {
      salesAgg.andWhere("product.brand_id IN (:...brandIds)", { brandIds });
    }

    const salesRaw = await salesAgg.getRawOne();

    const currentAmount = Number(salesRaw?.currentAmount) || 0;
    const currentQuantity = Number(salesRaw?.currentQuantity) || 0;
    const currentBrands = Number(salesRaw?.currentBrands) || 0;

    return {
      currentAmount,
      currentQuantity,
      currentBrands,
      amountProgress: target.targetAmount
        ? (currentAmount / Number(target.targetAmount)) * 100
        : 0,
      quantityProgress: target.targetQuantity
        ? (currentQuantity / Number(target.targetQuantity)) * 100
        : 0,
      brandsProgress: target.targetBrands
        ? (currentBrands / Number(target.targetBrands)) * 100
        : 0,
    };
  }

  async getMyTarget(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ["branch", "branch.project", "assignedBrands"],
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Resolve the branch from the user's last check-in, fall back to assigned branch
    const lastCheckedInJourney = await this.saleRepository.manager
      .createQueryBuilder(Journey, "journey")
      .innerJoinAndSelect("journey.checkin", "checkin")
      .leftJoinAndSelect("journey.branch", "branch")
      .where("journey.user.id = :userId", { userId })
      .andWhere("checkin.checkInTime IS NOT NULL")
      .orderBy("checkin.checkInTime", "DESC")
      .addOrderBy("journey.date", "DESC")
      .addOrderBy("journey.created_at", "DESC")
      .getOne();

    const branch = lastCheckedInJourney?.branch ?? user.branch;

    if (!branch) {
      throw new NotFoundException(
        "User has no check-ins and is not assigned to a branch",
      );
    }

    const target = await this.getCurrentTarget(branch.id);

    if (!target) {
      return {
        target: null,
        summary: null,
        brandsBreakdown: [],
      };
    }

    // Determine which brands the user is allowed to see
    const isCustomMode =
      user.brandAssignmentMode === BrandAssignmentMode.CUSTOM;
    const assignedBrandIds = isCustomMode
      ? (user.assignedBrands || []).map((b) => b.id)
      : [];

    const targetBrandIds = (target.brands || []).map((b) => b.id);

    // In custom mode, only show assigned brands that are part of the target.
    // In ALL mode, show all target brands (or all sales if target has no brands).
    const relevantBrandIds = isCustomMode
      ? targetBrandIds.filter((id) => assignedBrandIds.includes(id))
      : targetBrandIds;

    // If the target has no brands and the user is not restricted, do not filter by brand.
    const shouldFilterByBrands =
      isCustomMode || relevantBrandIds.length > 0 || targetBrandIds.length > 0;
    const hasRelevantBrands = relevantBrandIds.length > 0;

    let totalAchievedAmount = 0;
    let totalAchievedQuantity = 0;
    let brandsBreakdown: any[] = [];

    if (!shouldFilterByBrands || hasRelevantBrands) {
      // Total achievement for the relevant brands
      const totalAgg = this.saleRepository
        .createQueryBuilder("sale")
        .leftJoin("sale.product", "product")
        .select("COALESCE(SUM(sale.total_amount), 0)", "amount")
        .addSelect("COALESCE(SUM(sale.quantity), 0)", "quantity")
        .where("sale.branchId = :branchId", { branchId: target.branch.id })
        .andWhere("DATE(sale.sale_date) BETWEEN :startDate AND :endDate", {
          startDate: target.startDate,
          endDate: target.endDate,
        });

      if (shouldFilterByBrands) {
        totalAgg.andWhere("product.brand_id IN (:...relevantBrandIds)", {
          relevantBrandIds,
        });
      }

      const totalRaw = await totalAgg.getRawOne();
      totalAchievedAmount = Number(totalRaw?.amount) || 0;
      totalAchievedQuantity = Number(totalRaw?.quantity) || 0;

      // Per-brand achievement breakdown
      if (hasRelevantBrands) {
        const perBrandAgg = this.saleRepository
          .createQueryBuilder("sale")
          .leftJoin("sale.product", "product")
          .leftJoin("product.brand", "brand")
          .select("brand.id", "brandId")
          .addSelect("brand.name", "brandName")
          .addSelect("COALESCE(SUM(sale.total_amount), 0)", "achievedAmount")
          .addSelect("COALESCE(SUM(sale.quantity), 0)", "achievedQuantity")
          .where("sale.branchId = :branchId", { branchId: target.branch.id })
          .andWhere("DATE(sale.sale_date) BETWEEN :startDate AND :endDate", {
            startDate: target.startDate,
            endDate: target.endDate,
          })
          .andWhere("product.brand_id IN (:...relevantBrandIds)", {
            relevantBrandIds,
          })
          .groupBy("brand.id")
          .addGroupBy("brand.name")
          .orderBy("SUM(sale.total_amount)", "DESC");

        const perBrandRaw = await perBrandAgg.getRawMany();
        brandsBreakdown = perBrandRaw.map((row) => ({
          brand: {
            id: row.brandId,
            name: row.brandName,
          },
          achievedAmount: Number(row.achievedAmount) || 0,
          achievedQuantity: Number(row.achievedQuantity) || 0,
        }));
      }
    }

    // Include target brands that have no sales yet with zero achievement
    const brandIdsWithSales = new Set(brandsBreakdown.map((b) => b.brand.id));
    for (const brand of target.brands || []) {
      if (
        relevantBrandIds.includes(brand.id) &&
        !brandIdsWithSales.has(brand.id)
      ) {
        brandsBreakdown.push({
          brand: {
            id: brand.id,
            name: brand.name,
          },
          achievedAmount: 0,
          achievedQuantity: 0,
        });
      }
    }

    const targetAmount = Number(target.targetAmount) || 0;
    const targetQuantity = Number(target.targetQuantity) || 0;

    return {
      target: {
        id: target.id,
        name: target.name,
        description: target.description,
        type: target.type,
        metricType: target.metricType,
        status: target.status,
        startDate: target.startDate,
        endDate: target.endDate,
        targetAmount,
        targetQuantity,
        targetBrands: Number(target.targetBrands) || 0,
        branch: target.branch
          ? { id: target.branch.id, name: target.branch.name }
          : null,
        brands: (target.brands || []).map((b) => ({ id: b.id, name: b.name })),
      },
      summary: {
        totalTargetAmount: targetAmount,
        totalAchievedAmount,
        totalTargetQuantity: targetQuantity,
        totalAchievedQuantity,
        amountProgressPercentage: targetAmount
          ? (totalAchievedAmount / targetAmount) * 100
          : 0,
        quantityProgressPercentage: targetQuantity
          ? (totalAchievedQuantity / targetQuantity) * 100
          : 0,
        achievedBrandsCount: brandsBreakdown.filter(
          (b) => b.achievedAmount > 0,
        ).length,
      },
      brandsBreakdown,
    };
  }

  /** Cron job runs on 1st day of every month at 2:00 AM */
  @Cron("0 2 1 * *")
  async handleAllTargets() {
    this.logger.log("Processing expired sales targets...");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const expiredTargets = await this.salesTargetRepository.find({
      where: {
        endDate: LessThan(new Date(new Date().setHours(0, 0, 0, 0))),
        status: SalesTargetStatus.ACTIVE,
      },
      relations: ["branch", "branch.project"],
    });

    for (const target of expiredTargets) {
      target.updateStatus();
      await this.salesTargetRepository.save(target);

      if (target.autoRenew && target.branch.autoCreateSalesTargets) {
        await this.createNewSalesTarget(target.branch, target.type);
        this.logger.log(
          `Created new ${target.type} sales target for branch ${target.branch.name}`,
        );
      }
    }

    await this.initializeMissingTargets();
  }

  // Initialize missing targets for branches with auto-create enabled
  async initializeMissingTargets(): Promise<void> {
    this.logger.log("Checking branches without current targets...");

    const branches = await this.branchRepository.find({
      where: { autoCreateSalesTargets: true },
      relations: ["project"],
    });
    let createdCount = 0;

    for (const branch of branches) {
      const currentTarget = await this.getCurrentTarget(branch.id);
      if (!currentTarget) {
        await this.createNewSalesTarget(branch, branch.salesTargetType);
        createdCount++;
        this.logger.log(
          `Created initial ${branch.salesTargetType} sales target for branch: ${branch.name}`,
        );
      }
    }

    if (createdCount > 0) {
      this.logger.log(`Created ${createdCount} initial sales targets`);
    }
  }

  // Method to manually trigger target creation for testing
  async manuallyCreateTargetsForDate(targetDate: Date): Promise<void> {
    this.logger.log(`Manually creating targets for date: ${targetDate}`);

    const branches = await this.branchRepository.find({
      where: { autoCreateSalesTargets: true },
      relations: ["project"],
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
        this.logger.log(
          `Created manual ${branch.salesTargetType} sales target for branch: ${branch.name}`,
        );
      }
    }
  }

  async getSalesTargetStatistics(projectId: string, branchId?: string) {
    console.log(projectId);
    const query = this.salesTargetRepository
      .createQueryBuilder("target")
      .leftJoin("target.branch", "branch")
      // .where('branch.projectId = :projectId', { projectId }) // REMOVED: branch.projectId might be ambiguous if column name differs
      .where("branch.project.id = :projectId", { projectId }) // NEW: Use the new relationship or project ID column
      .select([
        "COUNT(target.id) as totalTargets",
        "SUM(CASE WHEN target.status = :active THEN 1 ELSE 0 END) as activeTargets",
        "SUM(CASE WHEN target.status = :completed THEN 1 ELSE 0 END) as completedTargets",
        "SUM(CASE WHEN target.status = :expired THEN 1 ELSE 0 END) as expiredTargets",
        "AVG(target.currentAmount / NULLIF(target.targetAmount, 0)) as averageProgress",
        "SUM(target.targetAmount) as totalTargetAmount",
        "SUM(target.currentAmount) as totalCurrentAmount",
        "SUM(CASE WHEN target.type = :monthly THEN 1 ELSE 0 END) as monthlyTargets",
        "SUM(CASE WHEN target.type = :quarterly THEN 1 ELSE 0 END) as quarterlyTargets",
      ])
      .setParameters({
        active: SalesTargetStatus.ACTIVE,
        completed: SalesTargetStatus.COMPLETED,
        expired: SalesTargetStatus.EXPIRED,
        monthly: SalesTargetType.MONTHLY,
        quarterly: SalesTargetType.QUARTERLY,
      });

    if (branchId) {
      query.andWhere("branch.id = :branchId", { branchId });
    }
    return await query.getRawOne();
  }

  async getBranchPerformance(
    branchId: string,
    period: "month" | "quarter" | "year" = "month",
  ) {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "quarter":
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    return await this.salesTargetRepository
      .createQueryBuilder("target")
      .where("target.branchId = :branchId", { branchId })
      .andWhere("target.startDate >= :startDate", { startDate })
      .select([
        "target.type as type",
        "SUM(target.targetAmount) as totalTarget",
        "SUM(target.currentAmount) as totalAchieved",
        "AVG(target.currentAmount / NULLIF(target.targetAmount, 0)) * 100 as averageProgress",
      ])
      .groupBy("target.type")
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
      relations: ["branch", "branch.supervisor"],
      order: { endDate: "ASC" },
    });
  }
}
