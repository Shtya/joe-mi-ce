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
    public readonly userService : UsersService
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
      where: [
        { project_id: projectId, name: dto.name },

      ]
    });

    if (existing) throw new ConflictException('brand.name_exists');

    let categories = [];
    if (dto.categoryIds && dto.categoryIds.length > 0) {
      categories = await this.categoryRepository.find({
        where: { id: In(dto.categoryIds) }
      });

      if (categories.length !== dto.categoryIds.length) {
        throw new NotFoundException('category.not_found');
      }
    }

    const brand = this.brandRepository.create({
      name: dto.name,
      description: dto.description,
      logo_url: logoFile ? logoFile.path : dto.logo_url,
      ownerUserId: user.id, // always assign owner
      project: { id: projectId },
      categories: categories
    });

    return this.brandRepository.save(brand);
  }

 async update(id: string, dto: UpdateBrandDto, user: any): Promise<Brand> {
    const brand = await this.brandRepository.findOne({
      where: await this.projectOrOwnerWhere(user, { id }),
      relations: ['categories']
    });

    if (!brand) throw new NotFoundException('brand.not_found');

    Object.assign(brand, dto);
    return this.brandRepository.save(brand);
  }



  async assignCategories(brandId: string, categoryIds: string[], user: any): Promise<Brand> {
    const brand = await this.brandRepository.findOne({
      where: await this.projectOrOwnerWhere(user, { id: brandId }),
      relations: ['categories']
    });

    if (!brand) throw new NotFoundException('brand.not_found');

    const categories = await this.categoryRepository.find({
      where: { id: In(categoryIds) }
    });

    if (categories.length !== categoryIds.length) {
      throw new NotFoundException('category.not_found');
    }

    const existingIds = brand.categories.map(c => c.id);
    brand.categories = [
      ...brand.categories,
      ...categories.filter(c => !existingIds.includes(c.id))
    ];

    return this.brandRepository.save(brand);
  }
  async removeCategories(brandId: string, categoryIds: string[], user: any): Promise<Brand> {
    const brand = await this.brandRepository.findOne({
      where: await this.projectOrOwnerWhere(user, { id: brandId }),
      relations: ['categories']
    });

    if (!brand) throw new NotFoundException('brand.not_found');

    brand.categories = brand.categories.filter(cat => !categoryIds.includes(cat.id));
    return this.brandRepository.save(brand);
  }


  async findAll(user: any): Promise<Brand[]> {
    return this.brandRepository.find({
      where: await this.projectOrOwnerWhere(user)
    });
  }

  async findOne(id: string, user: any): Promise<Brand> {
    const brand = await this.brandRepository.findOne({
      where: await this.projectOrOwnerWhere(user, { id }),
      relations: ['categories']
    });

    if (!brand) throw new NotFoundException('brand.not_found');
    return brand;
  }

  async remove(id: string, user: any): Promise<void> {
    const brand = await this.findOne(id, user);
    await this.brandRepository.softRemove(brand);
  }
async findBrandsForMobile(
  query: PaginationQueryDto,
  user: any,
) {
  const { search, sortBy = 'name', sortOrder = 'ASC' } = query;

  // Resolve the project ID for this user
  const projectId = await this.userService.resolveProjectIdFromUser(user.id);

  const qb = this.brandRepository
    .createQueryBuilder('brand')
    .innerJoin('brand.project', 'project') // just join first
    .where('project.id = :projectId', { projectId }) // apply where on joined table
    .select(['brand.id', 'brand.name'])
    .orderBy(`brand.${sortBy}`, sortOrder);

  // Optional search filter
  if (search) {
    qb.andWhere('brand.name ILIKE :search', { search: `%${search}%` });
  }

  const brands = await qb.getMany();

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
  private async projectOrOwnerWhere(user: any, extra: any = {}) {
    const projectId = await this.userService.resolveProjectIdFromUser(user.id);
    return [
      { project: { id: projectId }, ...extra },
      { ownerUserId: user.id, ...extra }
    ];
  }

}
