import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateBrandDto, UpdateBrandDto } from 'dto/brand.dto';
import { Brand } from 'entities/products/brand.entity';
import { ERole } from 'enums/Role.enum';
import { Repository } from 'typeorm';

@Injectable()
export class BrandService {
  constructor(
    @InjectRepository(Brand)
    public brandRepository: Repository<Brand>,
  ) {}

  public isSuper(user: any) {
    return user?.role?.name === ERole.SUPER_ADMIN;
  }

  private maskOwnerId(brand: Brand, requester: any) {
    const show = this.isSuper(requester) || (brand.ownerUserId && brand.ownerUserId === requester?.id);
    return { ...brand, ownerUserId: show ? brand.ownerUserId : null };
  }

  async create(dto: CreateBrandDto, user: any) {
    const existing = await this.brandRepository.findOneBy({ name: dto.name  , ownerUserId : user.id});
    if (existing) throw new ConflictException('Brand name already exists');

    const ownerUserId = this.isSuper(user) ? null : user.id;

    const brand = this.brandRepository.create({
      name: dto.name,
      description: dto.description,
      logo_url: dto.logo_url,
      ownerUserId,
    });

    const saved = await this.brandRepository.save(brand);
    return this.maskOwnerId(saved, user);
  }

  async findAll(): Promise<Brand[]> {
    return await this.brandRepository.find();
  }

  async findOne(id: string): Promise<Brand> {
    const brand = await this.brandRepository.findOne({ where: { id } });
    if (!brand) {
      throw new NotFoundException(`Brand with ID ${id} not found`);
    }
    return brand;
  }

  async update(id: string, updateBrandDto: UpdateBrandDto): Promise<Brand> {
    const brand = await this.findOne(id);
    this.brandRepository.merge(brand, updateBrandDto);
    return await this.brandRepository.save(brand);
  }

  async remove(id: string): Promise<void> {
    const brand = await this.findOne(id);
    await this.brandRepository.remove(brand);
  }
}
