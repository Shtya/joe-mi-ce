import { Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { CreateCategoryDto, UpdateCategoryDto } from "dto/category.dto";
import { PaginationQueryDto } from "dto/pagination.dto";
import { Category } from "entities/products/category.entity";
import { ERole } from "enums/Role.enum";
import { UsersService } from "src/users/users.service";
import { Repository } from "typeorm";

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    public categoryRepository: Repository<Category>,
    private readonly userService: UsersService,
  ) {}

  public isSuper(user: any) {
    return user?.role?.name === ERole.SUPER_ADMIN;
  }

  private maskOwnerId(category: Category, requester: any) {
    const show =
      this.isSuper(requester) ||
      (category.ownerUserId && category.ownerUserId === requester?.id);

    return { ...category, ownerUserId: show ? category.ownerUserId : null };
  }

  /* ===================== CREATE ===================== */

  async create(dto: CreateCategoryDto, user: any) {
    const projectId = await this.userService.resolveProjectIdFromUser(user.id);

    const existing = await this.categoryRepository.findOne({
      where: {
        name: dto.name,
        project: { id: projectId },
      },
    });

    if (existing) {
      throw new ConflictException('category.name_exists');
    }

    const category = this.categoryRepository.create({
      name: dto.name,
      description: dto.description,
      ownerUserId: this.isSuper(user) ? null : user.id,
      project: { id: projectId },
    });

    const saved = await this.categoryRepository.save(category);
    return this.maskOwnerId(saved, user);
  }

  /* ===================== FIND ONE ===================== */

  async findOne(id: string, user: any): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: await this.projectWhere(user, { id }),
    });

    if (!category) {
      throw new NotFoundException('category.not_found');
    }

    return category;
  }

  /* ===================== UPDATE ===================== */

  async update(
    id: string,
    dto: UpdateCategoryDto,
    user: any,
  ): Promise<Category> {
    const category = await this.findOne(id, user);

    this.categoryRepository.merge(category, dto);
    return await this.categoryRepository.save(category);
  }

  /* ===================== MOBILE ===================== */

  async findAllForMobile(
    brandId: string,
    query: PaginationQueryDto,
    user: any,
  ) {
    const { search, sortBy = 'name', sortOrder = 'ASC' } = query;

    const projectId = await this.userService.resolveProjectIdFromUser(user.id);

    const qb = this.categoryRepository
      .createQueryBuilder('category')
      .innerJoin('category.brands', 'brand', 'brand.id = :brandId', { brandId })
      .innerJoin('category.project', 'project', 'project.id = :projectId', {
        projectId,
      })
      .select(['category.id', 'category.name'])
      .orderBy(`category.${sortBy}`, sortOrder);

    if (search) {
      qb.andWhere('category.name ILIKE :search', {
        search: `%${search}%`,
      });
    }

    const categories = await qb.getMany();

    return {
      success: true,
      data: categories,
    };
  }

  /* ===================== HELPERS ===================== */

  private async projectWhere(user: any, extra: any = {}) {
    const projectId = await this.userService.resolveProjectIdFromUser(user.id);

    return {
      project: { id: projectId },
      ...extra,
    };
  }
}
