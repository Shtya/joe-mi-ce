import { Controller, Get, Post, Body, Param, Put, Delete, Query, UseGuards, Req, ParseUUIDPipe } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto } from 'dto/category.dto';
import { PaginationQueryDto } from 'dto/pagination.dto';
import { CRUD } from 'common/crud.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { ERole } from 'enums/Role.enum';

@UseGuards(AuthGuard)
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @Permissions(EPermission.CATEGORY_CREATE)
  create(@Body() createCategoryDto: CreateCategoryDto, @Req() req: any) {
    return this.categoryService.create(createCategoryDto, req.user);
  }
@Get("mobile/list/:brandId")
@Permissions(EPermission.BRAND_READ)
findCategoriesByBrand(
  @Param('brandId', new ParseUUIDPipe()) brandId: string,
  @Query() query: PaginationQueryDto,
  @Req() req: any
) {
  return this.categoryService.findAllForMobile(brandId, query, req.user);
}

@Get()
@Permissions(EPermission.CATEGORY_READ)
async findAll(@Query() query: PaginationQueryDto, @Req() req: any) {
  const user = req.user;
  const isSuper = user?.role?.name === ERole.SUPER_ADMIN;

  // Super admins see all categories
  if (isSuper) {
    return CRUD.findAll(
      this.categoryService.categoryRepository,
      'category',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      [],
      ['name']
    );
  }

  // Regular users: categories in the project OR owned by the user
  const projectId = await this.categoryService.userService.resolveProjectIdFromUser(user.id);

  // Define OR filters as an array
  const orFilters = [
    { project: { id: projectId } },
    { ownerUserId: user.id }
  ];

  return CRUD.findAll(
    this.categoryService.categoryRepository,
    'category',
    query.search,
    query.page,
    query.limit,
    query.sortBy,
    query.sortOrder,
    [],
    ['name'],
    undefined, // regular filters (none in this case)
    orFilters  // OR filters
  );
}
  @Get(':id')
  @Permissions(EPermission.CATEGORY_READ)
  findOne(@Param('id') id: string,
    @Req() req:any) {
    return this.categoryService.findOne(id,req.user);
  }

  @Put(':id')
  @Permissions(EPermission.CATEGORY_UPDATE)
  update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto,
    @Req() req:any) {

    return this.categoryService.update(id, updateCategoryDto,req.user);
  }

  @Delete(':id')
  @Permissions(EPermission.CATEGORY_DELETE)
  remove(@Param('id') id: string) {
    return CRUD.delete(this.categoryService.categoryRepository, 'category', id);
  }
  private async projectOrOwnerWhere(user: any, extra: any = {}) {
  const projectId = await this.categoryService.userService.resolveProjectIdFromUser(user.id);

  return [
    { project: { id: projectId }, ...extra },
    { ownerUserId: user.id, ...extra }
  ];
}

}
