import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateBrandDto, UpdateBrandDto } from 'dto/brand.dto';
import { PaginationQueryDto } from 'dto/pagination.dto';
import { Brand } from 'entities/products/brand.entity';
import { Category } from 'entities/products/category.entity';
import { ERole } from 'enums/Role.enum';
import { ILike, In, Repository } from 'typeorm';

@Injectable()
export class BrandService {
  constructor(
    @InjectRepository(Brand)
    public brandRepository: Repository<Brand>,
    @InjectRepository(Category)
    public categoryRepository: Repository<Category>,
  ) {}

  public isSuper(user: any) {
    return user?.role?.name === ERole.SUPER_ADMIN;
  }

  private maskOwnerId(brand: Brand, requester: any) {
    const show = this.isSuper(requester) || (brand.ownerUserId && brand.ownerUserId === requester?.id);
    return { ...brand, ownerUserId: show ? brand.ownerUserId : null };
  }

  async create(dto: CreateBrandDto, user: any, logoFile?: Express.Multer.File) {
    // Check if brand name already exists for this user
    const existing = await this.brandRepository.findOneBy({ 
      name: dto.name, 
      ownerUserId: user.id 
    });
    
    if (existing) throw new ConflictException('brand.name_exists');

    const ownerUserId = this.isSuper(user) ? null : user.id;

    // Create brand instance
    const brand = this.brandRepository.create({
      name: dto.name,
      description: dto.description,
      logo_url: logoFile ? logoFile.path : dto.logo_url,
      ownerUserId,
    });

    // Assign categories if provided
    if (dto.categoryIds && dto.categoryIds.length > 0) {
      const categories = await this.categoryRepository.find({
        where: { id: In(dto.categoryIds) }
      });

      // Check if all categories exist
      if (categories.length !== dto.categoryIds.length) {
        const foundIds = categories.map(cat => cat.id);
        const missingIds = dto.categoryIds.filter(id => !foundIds.includes(id));
        throw new NotFoundException(`Categories not found: ${missingIds.join(', ')}`);
      }

      brand.categories = categories;
    }

    const saved = await this.brandRepository.save(brand);
    return this.maskOwnerId(saved, user);
  }

  async update(id: string, updateBrandDto: UpdateBrandDto): Promise<Brand> {
    const brand = await this.brandRepository.findOne({ 
      where: { id },
      relations: ['categories'] // Load existing categories
    });

    if (!brand) {
      throw new NotFoundException('brand.not_found');
    }

    // Update basic fields
    if (updateBrandDto.name !== undefined) brand.name = updateBrandDto.name;
    if (updateBrandDto.description !== undefined) brand.description = updateBrandDto.description;
    if (updateBrandDto.logo_url !== undefined) brand.logo_url = updateBrandDto.logo_url;

    // Update categories if provided
    if (updateBrandDto.categoryIds !== undefined) {
      if (updateBrandDto.categoryIds.length === 0) {
        // Clear all categories
        brand.categories = [];
      } else {
        // Find and assign new categories
        const categories = await this.categoryRepository.find({
          where: { id: In(updateBrandDto.categoryIds) }
        });

        // Check if all categories exist
        if (categories.length !== updateBrandDto.categoryIds.length) {
          const foundIds = categories.map(cat => cat.id);
          const missingIds = updateBrandDto.categoryIds.filter(id => !foundIds.includes(id));
          throw new NotFoundException(`Categories not found: ${missingIds.join(', ')}`);
        }

        brand.categories = categories;
      }
    }

    const updatedBrand = await this.brandRepository.save(brand);
    return updatedBrand;
  }

  async assignCategories(brandId: string, categoryIds: string[]): Promise<Brand> {
    const brand = await this.brandRepository.findOne({ 
      where: { id: brandId },
      relations: ['categories']
    });

    if (!brand) {
      throw new NotFoundException('brand.not_found');
    }

    const categories = await this.categoryRepository.find({
      where: { id: In(categoryIds) }
    });

    // Check if all categories exist
    if (categories.length !== categoryIds.length) {
      const foundIds = categories.map(cat => cat.id);
      const missingIds = categoryIds.filter(id => !foundIds.includes(id));
      throw new NotFoundException(`Categories not found: ${missingIds.join(', ')}`);
    }

    // Add new categories (avoid duplicates)
    const existingCategoryIds = brand.categories.map(cat => cat.id);
    const newCategories = categories.filter(cat => !existingCategoryIds.includes(cat.id));
    
    brand.categories = [...brand.categories, ...newCategories];

    return await this.brandRepository.save(brand);
  }

  async removeCategories(brandId: string, categoryIds: string[]): Promise<Brand> {
    const brand = await this.brandRepository.findOne({ 
      where: { id: brandId },
      relations: ['categories']
    });

    if (!brand) {
      throw new NotFoundException(('brand.not_found'));
    }

    // Filter out the categories to remove
    brand.categories = brand.categories.filter(cat => !categoryIds.includes(cat.id));

    return await this.brandRepository.save(brand);
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


  async remove(id: string): Promise<void> {
    const brand = await this.findOne(id);
    await this.brandRepository.remove(brand);
  }
  async findAllForMobile(query: PaginationQueryDto, user: any) {


    const where: any = {};


    const {search, sortBy = 'name', sortOrder = 'ASC' } = query;

    const findOptions: any = {
      where,
      select: ['id', 'name'],
      order: { [sortBy]: sortOrder },

    };

    if (search) {
      where.name = ILike(`%${search}%`);
    }

    try {
      const brands = await this.brandRepository.find(findOptions);


      return {
        success: true,
        data: brands,
      };
    } catch (error) {
      console.error('Error in findAllForMobile:', error);
      return {
        success: false,
        message: 'Failed to fetch brands',
        data: []
      };
    }
  }
}
