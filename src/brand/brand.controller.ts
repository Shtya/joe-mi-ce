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

  @Get()
  @Permissions(EPermission.BRAND_READ)
  findAll(@Query() query: PaginationQueryDto, @Req() req: any) {
    const isSuper = req?.user?.role?.name === ERole.SUPER_ADMIN;
    const filters = isSuper ? undefined : { ownerUserId: req?.user?.id };

    return CRUD.findAll(this.brandService.brandRepository, 'brand', query.search, query.page, query.limit, query.sortBy, query.sortOrder, [], ['name'], filters);
  }

  @Get(':id')
  @Permissions(EPermission.BRAND_READ)
  findOne(@Param('id') id: string) {
    return this.brandService.findOne(id);
  }

  @Put(':id')
  @Permissions(EPermission.BRAND_UPDATE)
  update(@Param('id') id: string, @Body() updateBrandDto: UpdateBrandDto) {
    return this.brandService.update(id, updateBrandDto);
  }

  @Delete(':id')
  @Permissions(EPermission.BRAND_DELETE)
  remove(@Param('id') id: string) {
    return CRUD.delete(this.brandService.brandRepository, 'brand', id);
  }
}