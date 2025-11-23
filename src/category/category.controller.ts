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
  findAll(@Query() query: PaginationQueryDto, @Req() req: any) {
    const isSuper = req?.user?.role?.name === ERole.SUPER_ADMIN;
    const filters = isSuper ? undefined : { ownerUserId: req?.user?.id };

    return CRUD.findAll(this.categoryService.categoryRepository, 'category', query.search, query.page, query.limit, query.sortBy, query.sortOrder, [], ['name'], filters);
  }

  @Get(':id')
  @Permissions(EPermission.CATEGORY_READ)
  findOne(@Param('id') id: string) {
    return this.categoryService.findOne(id);
  }

  @Put(':id')
  @Permissions(EPermission.CATEGORY_UPDATE)
  update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    return this.categoryService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @Permissions(EPermission.CATEGORY_DELETE)
  remove(@Param('id') id: string) {
    return CRUD.delete(this.categoryService.categoryRepository, 'category', id);
  }
}
