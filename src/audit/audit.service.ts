// audit.service.ts
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateAuditDto, UpdateAuditDto } from 'dto/audit.dto';
import { Audit, AuditStatus } from 'entities/audit.entity';
import { Branch } from 'entities/branch.entity';
import { Product } from 'entities/products/product.entity';
import { User } from 'entities/user.entity';
import { Competitor } from 'entities/competitor.entity';
import { AuditCompetitor } from 'entities/audit-competitor.entity';
import { Repository, LessThanOrEqual, In, DataSource } from 'typeorm';

@Injectable()
export class AuditsService {
  constructor(
    @InjectRepository(Audit) public readonly repo: Repository<Audit>,
    @InjectRepository(Branch) public readonly branchRepo: Repository<Branch>,
    @InjectRepository(User) public readonly userRepo: Repository<User>,
    @InjectRepository(Product) public readonly productRepo: Repository<Product>,
    @InjectRepository(Competitor) public readonly competitorRepo: Repository<Competitor>,
    @InjectRepository(AuditCompetitor) public readonly auditCompetitorRepo: Repository<AuditCompetitor>,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreateAuditDto, promoterId: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      // -------------------------------
      // Load promoter + product
      // -------------------------------
      const [promoter, product] = await Promise.all([
        this.userRepo.findOne({
          where: { id: promoterId },
          relations: ['branch', 'branch.project'],
        }),
        this.productRepo.findOne({
          where: { id: dto.product_id },
          relations: ['brand', 'category'],
        }),
      ]);
  
      if (!promoter) throw new NotFoundException('Promoter not found');
      if (!product) throw new NotFoundException('Product not found');
  
      // -------------------------------
      // Load branch
      // -------------------------------
      const branch = await this.branchRepo.findOne({
        where: { id: dto.branch_id },
        relations: ['project'],
      });
  
      if (!branch) throw new NotFoundException('Branch not found');
  
      // -------------------------------
      // Prevent duplicate audit
      // -------------------------------
      await this.preventDuplicateAuditToday(
        promoterId,
        dto.product_id,
        branch.id,
        dto.audit_date,
      );
  
      // -------------------------------
      // Create main audit
      // -------------------------------
      const auditData: Partial<Audit> = {
        productId: dto.product_id,
        branchId: branch.id,
        promoterId: promoterId,
  
        is_available: dto.is_available,
        current_price: dto.current_price,
        current_discount: dto.current_discount || 0,
        discount_reason: dto.discount_reason || null,
  
        audit_date: dto.audit_date || new Date().toISOString().split('T')[0],
  
        product_name: product.name,
        product_brand: product.brand?.name || null,
        product_category: product.category?.name || null,
  
        branch,
        promoter,
        product,
        projectId: dto.projectId || promoter.project_id || branch.project?.id || null,
      };
  
      const audit = this.repo.create(auditData);
      const savedAudit = await queryRunner.manager.save(audit);
 
      if (dto.competitors?.length > 0) {
        const competitorIds = dto.competitors.map((c) => c.competitor_id);
  
        // 1️⃣ Validate competitor IDs
        const validCompetitors = await this.competitorRepo.find({
          where: { id: In(competitorIds) },
        });
  
        const validIdsSet = new Set(validCompetitors.map((c) => c.id));
        const missingIds = competitorIds.filter((id) => !validIdsSet.has(id));
  
        if (missingIds.length > 0) {
          throw new NotFoundException({
            message: 'One or more competitors not found',
            invalid_competitors: missingIds,
          });
        }
  
        // 2️⃣ Validate duplicates
        const duplicates = competitorIds.filter(
          (id, idx, arr) => arr.indexOf(id) !== idx,
        );
  
        if (duplicates.length > 0) {
          throw new BadRequestException({
            message: 'Duplicate competitor IDs',
            duplicate_ids: duplicates,
          });
        }
  
        // 3️⃣ Load historical competitors
        const historical = await this.getHistoricalCompetitors(
          dto.product_id,
          branch.id,
        );
  
        // 4️⃣ Merge new + historical competitors
        const mergedCompetitors = this.mergeCompetitors(
          dto.competitors,
          historical,
        );
  
        // 5️⃣ Save competitors
        for (const comp of mergedCompetitors) {
          if (comp.is_available === undefined) {
            throw new BadRequestException({
              message: `Missing is_available for competitor ${comp.competitor_id}`,
            });
          }
  
          if (comp.is_available === true && comp.price === undefined) {
            throw new BadRequestException({
              message: `Missing price for competitor ${comp.competitor_id}`,
            });
          }
  
          const competitor = this.auditCompetitorRepo.create({
            audit: savedAudit,
            audit_id: savedAudit.id,
            competitor_id: comp.competitor_id,
            price: comp.price,
            discount: comp.discount,
            is_available: comp.is_available,
            is_national: comp.is_national,
            discount_reason: comp.discount_reason,
            observed_at: comp.observed_at
              ? new Date(comp.observed_at)
              : new Date(),
            audit_date: savedAudit.audit_date,
          });
  
          await queryRunner.manager.save(AuditCompetitor, competitor);
        }
      }
  
      // -------------------------------
      // Load full audit to return
      // -------------------------------
      const fullAudit = await queryRunner.manager.findOne(Audit, {
        where: { id: savedAudit.id },
        relations: [
          'product',
          'product.brand',
          'product.category',
          'branch',
          'branch.project',
          'promoter',
          'auditCompetitors',
          'auditCompetitors.competitor',
        ],
      });
  
      // Commit transaction
      await queryRunner.commitTransaction();
  
      return fullAudit;
    } catch (err) {
      await queryRunner.rollbackTransaction();
  
      if (err?.code === '23505') {
        throw new ConflictException(
          'Cannot create another audit for the same product in this branch today.',
        );
      }
  
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException ||
        err instanceof ConflictException
      ) {
        throw err;
      }
  
      throw new BadRequestException(`Failed to create audit: ${err.message}`);
    } finally {
      await queryRunner.release();
    }
  }
  

  private async preventDuplicateAuditToday(
    promoterId: string,
    productId: string,
    branchId: string,
    auditDate?: string
  ): Promise<void> {
    const today = auditDate || new Date().toISOString().split('T')[0];
    
    const existingAudit = await this.repo.findOne({
      where: {
        promoterId,
        productId,
        branchId,
        audit_date: today
      }
    });

    if (existingAudit) {
      throw new ConflictException(
        `You have already audited this product today (${today}). Please wait until tomorrow.`
      );
    }
  }

  private async getHistoricalCompetitors(productId: string, branchId: string): Promise<any[]> {
    const today = new Date().toISOString().split('T')[0];
    
    const previousAudits = await this.repo.find({
      where: {
        productId,
        branchId,
        audit_date: LessThanOrEqual(today)
      },
      order: { audit_date: 'DESC' },
      take: 3
    });

    const competitors: any[] = [];
    const seenCompetitorIds = new Set<string>();

    for (const audit of previousAudits) {
      const auditCompetitors = await this.auditCompetitorRepo.find({
        where: { audit_id: audit.id },
        relations: ['competitor']
      });

      for (const ac of auditCompetitors) {
        if (ac.competitor_id && !seenCompetitorIds.has(ac.competitor_id)) {
          competitors.push({
            competitor_id: ac.competitor_id,
            competitor: ac.competitor,
            price: ac.price,
            discount: ac.discount,
            is_available: ac.is_available,
            is_national: ac.is_national,
            discount_reason: ac.discount_reason,
            observed_at: ac.observed_at
          });
          seenCompetitorIds.add(ac.competitor_id);
        }
      }
    }

    return competitors;
  }

  private mergeCompetitors(
    newCompetitors: any[], 
    historicalCompetitors: any[]
  ): any[] {
    const merged = [...historicalCompetitors];
    const seenIds = new Set(historicalCompetitors.map(c => c.competitor_id));

    for (const newComp of newCompetitors) {
      if (newComp.competitor_id && !seenIds.has(newComp.competitor_id)) {
        merged.push({
          ...newComp,
          observed_at: newComp.observed_at || new Date()
        });
        seenIds.add(newComp.competitor_id);
      }
    }

    return merged;
  }

  async update(id: string, dto: UpdateAuditDto): Promise<Audit> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const audit = await this.findOne(id);

      
      if (dto.is_available !== undefined) audit.is_available = dto.is_available;
      if (dto.current_price !== undefined) audit.current_price = dto.current_price;
      if (dto.current_discount !== undefined) audit.current_discount = dto.current_discount;
      if (dto.discount_reason !== undefined) audit.discount_reason = dto.discount_reason;
      if (dto.audit_date !== undefined) audit.audit_date = dto.audit_date;

      // تحديث المنافسين
      if (dto.competitors !== undefined) {
        // حذف المنافسين الحاليين
        await queryRunner.manager.delete(AuditCompetitor, { audit_id: audit.id });

        let competitorsCount = 0;
        let availableCompetitorsCount = 0;

        // إضافة المنافسين الجدد
        for (const compDto of dto.competitors) {
          const competitor = await this.competitorRepo.findOne({
            where: { id: compDto.competitor_id }
          });

          if (!competitor) continue;

          const auditCompetitor = this.auditCompetitorRepo.create({
            audit: audit,
            audit_id: audit.id,
            competitor_id: compDto.competitor_id,
            price: compDto.price,
            discount: compDto.discount,
            is_available: compDto.is_available !== undefined ? compDto.is_available : true,
            is_national: compDto.is_national,
            discount_reason: compDto.discount_reason,
            observed_at: compDto.observed_at ? new Date(compDto.observed_at) : new Date(),
            audit_date: audit.audit_date,
          });

          await queryRunner.manager.save(AuditCompetitor, auditCompetitor);
          
          competitorsCount++;
          if (compDto.is_available) {
            availableCompetitorsCount++;
          }
        }

        audit.competitors_count = competitorsCount;
        audit.available_competitors_count = availableCompetitorsCount;
      }

      const updatedAudit = await queryRunner.manager.save(Audit, audit);
      await queryRunner.commitTransaction();

      return this.findOne(updatedAudit.id);

    } catch (err) {
      await queryRunner.rollbackTransaction();
      
      if (err?.code === '23505') {
        throw new ConflictException('Cannot update: An audit for the same product in this branch on the same date already exists.');
      }
      
      throw new BadRequestException(`Failed to update audit: ${err.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async findOne(id: string): Promise<Audit> {
    const audit = await this.repo.findOne({
      where: { id },
      relations: [
        'promoter', 
        'branch', 
        'product', 
        'reviewed_by',
        'auditCompetitors',
        'auditCompetitors.competitor'
      ],
    });
    
    if (!audit) throw new NotFoundException('Audit not found');
    
    // استدعاء دالة المساعد للحصول على المنافسين كمصفوفة
    audit.auditCompetitors = audit.getCompetitors();
    
    return audit;
  }

  // دالة لتحميل المنافسين لمراجعة محددة
  async loadAuditCompetitors(auditId: string): Promise<any[]> {
    const auditCompetitors = await this.auditCompetitorRepo.find({
      where: { audit_id: auditId },
      relations: ['competitor']
    });

    return auditCompetitors.map(ac => ({
      competitor_id: ac.competitor_id,
      competitor: ac.competitor,
      price: ac.price,
      discount: ac.discount,
      is_available: ac.is_available,
      is_national: ac.is_national,
      discount_reason: ac.discount_reason,
      observed_at: ac.observed_at
    }));
  }

  // دالة لتحميل المنافسين لمراجعات متعددة
  async loadCompetitorsForAudits(audits: Audit[]): Promise<void> {
    const auditIds = audits.map(a => a.id);
    
    if (auditIds.length === 0) return;

    const auditCompetitors = await this.auditCompetitorRepo
      .createQueryBuilder('ac')
      .leftJoinAndSelect('ac.competitor', 'competitor')
      .where('ac.audit_id IN (:...auditIds)', { auditIds })
      .getMany();

    const competitorsByAuditId = auditCompetitors.reduce((acc, ac) => {
      if (!acc[ac.audit_id]) acc[ac.audit_id] = [];
      acc[ac.audit_id].push({
        competitor_id: ac.competitor_id,
        competitor: ac.competitor,
        price: ac.price,
        discount: ac.discount,
        is_available: ac.is_available,
        is_national: ac.is_national,
        discount_reason: ac.discount_reason,
        observed_at: ac.observed_at
      });
      return acc;
    }, {});

    // إضافة المنافسين لكل مراجعة
    audits.forEach(audit => {
      audit.auditCompetitors = competitorsByAuditId[audit.id] || [];
      audit.calculateCompetitorCounts();
    });
  }

  // تحديث دالة الحصول على جميع المنتجات مع حالة المراجعة اليومية
  async getAllProductsWithTodayAuditStatusPaginated(
    promoterId: string,
    branchId?: string,
    filters?: { 
      brand?: string; 
      category?: string; 
      search?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{
    products: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const promoter = await this.userRepo.findOne({
      where: { id: promoterId },
      relations: ['branch', 'project'],
    });
    
    if (!promoter) throw new NotFoundException('Promoter not found');
    
    if (!branchId) {
      throw new BadRequestException('Promoter is not assigned to any branch or project');
    }
    
    const today = new Date().toISOString().split('T')[0];
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;
    
    // بناء الاستعلام للمنتجات - مصحح
    const queryBuilder = this.productRepo.createQueryBuilder('product')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoin('product.stock', 'stock')
      .leftJoin('stock.branch', 'branchStock')
      .leftJoin('product.project', 'project')
      .addSelect('project.id');
    
    // تصفية حسب الفرع
    if (branchId) {
      queryBuilder.andWhere('branchStock.id = :branchId', { branchId });
    }
    
    if (filters?.brand) {
      queryBuilder.andWhere('brand.name = :brand', { brand: filters.brand });
    }
    
    if (filters?.category) {
      queryBuilder.andWhere('category.name = :category', { category: filters.category });
    }
    
    if (filters?.search) {
      queryBuilder.andWhere(
        '(product.name ILIKE :search OR brand.name ILIKE :search OR category.name ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }
    
    // إضافة تصفية للمشروع إذا كان المروج مرتبطًا بمشروع
    if (promoter.project) {
      queryBuilder.andWhere('project.id = :projectId', { projectId: promoter.project.id });
    }
    
    // حساب العدد الكلي
    const totalQuery = queryBuilder.clone();
    const total = await totalQuery.getCount();
    
    // تطبيق التقسيم للصفحات
    const allProducts = await queryBuilder
      .skip(skip)
      .take(limit)
      .getMany();
    
    // جلب المراجعات اليومية
    const todayAudits = await this.repo.find({
      where: {
        promoterId,
        branchId,
        audit_date: today
      },
      relations: ['product']
    });
    
    // تحميل المنافسين للمراجعات اليومية
    await this.loadCompetitorsForAudits(todayAudits);
    
    // إنشاء خريطة للمراجعات اليومية
    const todayAuditMap = new Map<string, Audit>();
    todayAudits.forEach(audit => {
      todayAuditMap.set(audit.productId, audit);
    });
    
    // دمج حالة المراجعة مع المنتجات
    const productsWithStatus = allProducts.map(product => {
      const todayAudit = todayAuditMap.get(product.id);
      
      return {
        ...product,
        audited_today: !!todayAudit,
        latest_audit: todayAudit ? {
          id: todayAudit.id,
          is_available: todayAudit.is_available,
          current_price: todayAudit.current_price,
          current_discount: todayAudit.current_discount,
          discount_reason: todayAudit.discount_reason,
          competitors: todayAudit.auditCompetitors || [],
          competitors_count: todayAudit.competitors_count,
          available_competitors_count: todayAudit.available_competitors_count,
          created_at: todayAudit.created_at
        } : undefined
      };
    });
    
    return {
      products: productsWithStatus,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // دالة إضافية للحصول على تحليل المنافسين
  
}