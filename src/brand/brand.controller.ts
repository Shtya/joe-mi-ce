import { Controller, Get, Post, Body, Param, Put, Delete, Query, UseGuards, Req } from '@nestjs/common';
import { BrandService } from './brand.service';
import { CreateBrandDto, UpdateBrandDto } from 'dto/brand.dto';
import { PaginationQueryDto } from 'dto/pagination.dto';
import { CRUD } from 'common/crud.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { ERole } from 'enums/Role.enum';

@UseGuards(AuthGuard)
@Controller('brands')
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @Post()
  @Permissions(EPermission.BRAND_CREATE)
  create(@Body() dto: CreateBrandDto, @Req() req: any) {
    return this.brandService.create(dto, req.user);
  }

  @Get("mobile/list")
  @Permissions(EPermission.BRAND_READ)
  findAllForMobile(@Query() query: PaginationQueryDto, @Req() req: any) {
    return this.brandService.findAllForMobile(query, req.user);
  }
  @Post(':id/categories')
  @Permissions(EPermission.BRAND_UPDATE)
  assignCategories(
    @Param('id') id: string,
    @Body() body: { categoryIds: string[] },
    @Req() req:any
  ) {
    return this.brandService.assignCategories(id, body.categoryIds,req.user);
  }
  @Delete(':id/categories')
  @Permissions(EPermission.BRAND_UPDATE)
  removeCategories(
    @Param('id') id: string,
    @Body() body: { categoryIds: string[] },
    @Req() req:any

  ) {
    return this.brandService.removeCategories(id, body.categoryIds,req.user);
  }

@Get()
@Permissions(EPermission.BRAND_READ)
  async findAll(@Query() query: PaginationQueryDto, @Req() req: any) {
  const user = req.user;
  const isSuper = user?.role?.name === ERole.SUPER_ADMIN;

  // Super admins see all brands
  if (isSuper) {
    return CRUD.findAll(
      this.brandService.brandRepository,
      'brand',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      ['categories'],
      ['name']
    );
  }

  // Regular users: brands in the project OR owned by the user
  const projectId =  await this.brandService.userService.resolveProjectIdFromUser(user.id);
  console.log(projectId)
  // Define OR filters as an array
  const orFilters = [
    { project: { id: projectId } },
    { ownerUserId: user.id }
  ];

  return CRUD.findAll(
    this.brandService.brandRepository,
    'brand',
    query.search,
    query.page,
    query.limit,
    query.sortBy,
    query.sortOrder,
    ['categories'],
    ['name'],
    undefined, // regular filters (none in this case)
    orFilters  // OR filters
  );
}

  @Get(':id')
  @Permissions(EPermission.BRAND_READ)
  findOne(@Param('id') id: string,
    @Req() req:any
) {
    return this.brandService.findOne(id,req.user);
  }

  @Put(':id')
  @Permissions(EPermission.BRAND_UPDATE)
  update(@Param('id') id: string, @Body() updateBrandDto: UpdateBrandDto,
    @Req() req:any
) {
    return this.brandService.update(id, updateBrandDto,req.user);
  }

  @Delete(':id')
  @Permissions(EPermission.BRAND_DELETE)
  remove(@Param('id') id: string) {
    return CRUD.delete(this.brandService.brandRepository, 'brand', id);
  }
}