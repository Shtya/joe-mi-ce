/* 
  get the competitors id  in competitors : []
  if this product someone make audit on it before on the same branch add this competitors inside the array
  
*/

import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateAuditDto, QueryAuditsDto, UpdateAuditDto, UpdateAuditStatusDto } from 'dto/audit.dto';
import { Audit } from 'entities/audit.entity';
import { Branch } from 'entities/branch.entity';
import { Competitor } from 'entities/competitor.entity';
import { Product } from 'entities/products/product.entity';
import { User } from 'entities/user.entity';
import { Repository, Between } from 'typeorm';

@Injectable()
export class AuditsService {
  constructor(
    @InjectRepository(Audit) public readonly repo: Repository<Audit>,
    @InjectRepository(Branch) public readonly branchRepo: Repository<Branch>,
    @InjectRepository(User) public readonly userRepo: Repository<User>,
    @InjectRepository(Product) public readonly productRepo: Repository<Product>,
    // @InjectRepository(Competitor) private readonly competitorRepo: Repository<Competitor>,
  ) {}


  async create(dto: CreateAuditDto): Promise<Audit> {
    const [branch, promoter , product] = await Promise.all([
        this.branchRepo.findOne({ where: { id: dto.branch_id }  , relations : ["project"]}), 
        this.userRepo.findOne({ where: { id: dto.promoter_id } }),
        this.productRepo.findOne({ where: { id: dto.product_id } })
      ]);


    if (!branch) throw new NotFoundException('Branch not found');
    if (!promoter) throw new NotFoundException('Promoter not found');

		const entity:any = this.repo.create({ 
			projectId : branch.project.id ,
      productId : dto.product_id  ,
      branchId : dto.branch_id ,
      promoterId : dto.promoter_id ,
      is_available: dto.is_available ?? false,
      current_price: dto.current_price ?? null,
      current_discount: dto.current_discount ?? null,
      notes: dto.notes ?? null,
      image_urls: dto.image_urls ?? null,
      competitors: dto.competitors ?? null,
      status: dto.status ?? undefined,
      audit_date: dto.audit_date ?? undefined,
      branch: { id: dto.branch_id } as any,
      promoter: { id: dto.promoter_id } as any,
      product: product,
      product_name: dto.product_name,
      product_brand: dto.product_brand ?? null,
      product_category: dto.product_category ?? null } as any );
    
    try {
      return await this.repo.save(entity);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException('An audit for the same product in the same branch on the same date already exists.');
      }
      throw err;
    }
  }

  async findOne(id: string): Promise<Audit> {
    const audit = await this.repo.findOne({
      where: { id },
            relations: ['promoter', 'branch', 'reviewed_by'],
    });
    if (!audit) throw new NotFoundException('Audit not found');
    return audit;
  }

  async update(id: string, dto: UpdateAuditDto): Promise<Audit> {
    const audit = await this.findOne(id);

    Object.assign(audit, {
      is_available: dto.is_available ?? audit.is_available,
      current_price: dto.current_price !== undefined ? dto.current_price : audit.current_price,
      current_discount: dto.current_discount !== undefined ? dto.current_discount : audit.current_discount,
      notes: dto.notes ?? audit.notes,
      image_urls: dto.image_urls ?? audit.image_urls,
      competitors: dto.competitors ?? audit.competitors,
      status: dto.status ?? audit.status,
      audit_date: dto.audit_date ?? audit.audit_date,

      product_name: dto.product_name ?? audit.product_name,
      product_brand: dto.product_brand ?? audit.product_brand,
      product_category: dto.product_category ?? audit.product_category,
    });

    if (dto.branch_id) (audit as any).branch = { id: dto.branch_id };
    if (dto.promoter_id) (audit as any).promoter = { id: dto.promoter_id };

    try {
      return await this.repo.save(audit);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException('Update conflict: An audit for the same product in this branch on the same date already exists.');
      }
      throw err;
    }
  }

  async updateStatus(id: string, dto: UpdateAuditStatusDto): Promise<Audit> {
    const audit = await this.findOne(id);
    const user =  await this.userRepo.findOne({where :{id : dto.reviewed_by_id}})
    if (!user) throw new NotFoundException('User not found');

    audit.status = dto.status;
    if (dto.reviewed_by_id) (audit as any).reviewed_by = { id: dto.reviewed_by_id };
    audit.reviewed_at = dto.reviewed_at ? new Date(dto.reviewed_at) : new Date();
    return this.repo.save(audit);
  }

}
