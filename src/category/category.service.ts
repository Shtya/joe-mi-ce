import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateCategoryDto, UpdateCategoryDto } from 'dto/category.dto';
import { Category } from 'entities/products/category.entity';
import { ERole } from 'enums/Role.enum';
import { Repository } from 'typeorm';

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
}
