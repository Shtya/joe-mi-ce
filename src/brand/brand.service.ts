import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateBrandDto, UpdateBrandDto } from 'dto/brand.dto';
import { PaginationQueryDto } from 'dto/pagination.dto';
import { Brand } from 'entities/products/brand.entity';
import { Category } from 'entities/products/category.entity';
import { ERole } from 'enums/Role.enum';
import { UsersService } from 'src/users/users.service';
import { ILike, In, Repository } from 'typeorm';

@Injectable()
export class BrandService {
  constructor(
    @InjectRepository(Brand)
    public brandRepository: Repository<Brand>,
    @InjectRepository(Category)
    public categoryRepository: Repository<Category>,
    private readonly userService : UsersService
  ) {}

  public isSuper(user: any) {
    return user?.role?.name === ERole.SUPER_ADMIN;
  }

  private maskOwnerId(brand: Brand, requester: any) {
    const show = this.isSuper(requester) || (brand.ownerUserId && brand.ownerUserId === requester?.id);
    return { ...brand, ownerUserId: show ? brand.ownerUserId : null };
  }

async create(dto: CreateBrandDto, user: any, logoFile?: Express.Multer.File) {
  const projectId = await this.userService.resolveProjectIdFromUser(user.id);

  const existing = await this.brandRepository.findOne({
    where: {
      name: dto.name,
      project: { id: projectId },
    },
  });

  if (existing) throw new ConflictException('brand.name_exists');

  const brand = this.brandRepository.create({
    name: dto.name,
    description: dto.description,
    logo_url: logoFile ? logoFile.path : dto.logo_url,
    ownerUserId: this.isSuper(user) ? null : user.id,
    project: { id: projectId },
  });

  return await this.brandRepository.save(brand);
}

async update(id: string, dto: UpdateBrandDto, user: any): Promise<Brand> {
  const brand = await this.brandRepository.findOne({
    where: await this.projectWhere(user, { id }),
    relations: ['categories'],
  });

  if (!brand) throw new NotFoundException('brand.not_found');

  Object.assign(brand, dto);

  return await this.brandRepository.save(brand);
}


async assignCategories(
  brandId: string,
  categoryIds: string[],
  user: any
): Promise<Brand> {
  const brand = await this.brandRepository.findOne({
    where: await this.projectWhere(user, { id: brandId }),
    relations: ['categories'],
  });

  if (!brand) throw new NotFoundException('brand.not_found');

  const categories = await this.categoryRepository.find({
    where: { id: In(categoryIds) },
  });

  if (categories.length !== categoryIds.length) {
    throw new NotFoundException('category.not_found');
  }

  const existingIds = brand.categories.map(c => c.id);
  brand.categories = [
    ...brand.categories,
    ...categories.filter(c => !existingIds.includes(c.id)),
  ];

  return await this.brandRepository.save(brand);
}

async removeCategories(
  brandId: string,
  categoryIds: string[],
  user: any
): Promise<Brand> {
  const brand = await this.brandRepository.findOne({
    where: await this.projectWhere(user, { id: brandId }),
    relations: ['categories'],
  });

  if (!brand) throw new NotFoundException('brand.not_found');

  brand.categories = brand.categories.filter(
    cat => !categoryIds.includes(cat.id)
  );

  return await this.brandRepository.save(brand);
}


async findAll(user: any): Promise<Brand[]> {
  return await this.brandRepository.find({
    where: await this.projectWhere(user),
  });
}

async findOne(id: string, user: any): Promise<Brand> {
  const where = await this.projectWhere(user, { id });

  const brand = await this.brandRepository.findOne({ where });

  if (!brand) {
    throw new NotFoundException('brand.not_found');
  }

  return brand;
}


async remove(id: string, user: any): Promise<void> {
  const brand = await this.findOne(id, user);
  await this.brandRepository.remove(brand);
}

async findAllForMobile(query: PaginationQueryDto, user: any) {
  const { search, sortBy = 'name', sortOrder = 'ASC' } = query;

  const where = await this.projectWhere(
    user,
    search ? { name: ILike(`%${search}%`) } : {}
  );

  const brands = await this.brandRepository.find({
    where,
    select: ['id', 'name'],
    order: { [sortBy]: sortOrder },
  });

  return {
    success: true,
    data: brands,
  };
}

  private async projectWhere(user: any, extra: any = {}) {
  const projectId = await this.userService.resolveProjectIdFromUser(user.id);

  return {
    project: { id: projectId },
    ...extra,
  };
}

}
