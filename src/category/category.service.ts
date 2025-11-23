import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateCategoryDto, UpdateCategoryDto } from 'dto/category.dto';
import { PaginationQueryDto } from 'dto/pagination.dto';
import { Category } from 'entities/products/category.entity';
import { ERole } from 'enums/Role.enum';
import { ILike, Repository } from 'typeorm';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    public categoryRepository: Repository<Category>,
  ) {}

  public isSuper(user: any) {
    return user?.role?.name === ERole.SUPER_ADMIN;
  }

  private maskOwnerId(category: Category, requester: any) {
    const show = this.isSuper(requester) || (category.ownerUserId && category.ownerUserId === requester?.id);
    return { ...category, ownerUserId: show ? category.ownerUserId : null };
  }

  async create(createCategoryDto: CreateCategoryDto, user: any) {
    const existing = await this.categoryRepository.findOneBy({ name: createCategoryDto.name, ownerUserId: user.id });

    if (existing) {
      throw new ConflictException('Category name already exists');
    }

    const ownerUserId = this.isSuper(user) ? null : user.id;

    const category = this.categoryRepository.create({
      name: createCategoryDto.name,
      description: createCategoryDto.description,
      ownerUserId,
    });

    const saved = await this.categoryRepository.save(category);
    return this.maskOwnerId(saved, user);

    // const category = this.categoryRepository.create(createCategoryDto);
    // return await this.categoryRepository.save(category);
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);
    this.categoryRepository.merge(category, updateCategoryDto);
    return await this.categoryRepository.save(category);
  }
  async findAllForMobile(brandId: string, query: PaginationQueryDto, user: any) {
    const { search, sortBy = 'name', sortOrder = 'ASC' } = query;
  
    try {
      const categories = await this.categoryRepository
        .createQueryBuilder('category')
        .innerJoin('category.brands', 'brand', 'brand.id = :brandId', { brandId })
        .select(['category.id', 'category.name'])
        .where(search ? 'category.name ILIKE :search' : '1=1', { search: `%${search}%` })
        .orderBy(`category.${sortBy}`, sortOrder)
        .getMany();
  
      return {
        success: true,
        data: categories,
      };
    } catch (error) {
      console.error('Error in findCategoriesByBrand:', error);
      return {
        success: false,
        message: 'Failed to fetch categories for brand',
        data: []
      };
    }
  }
}
