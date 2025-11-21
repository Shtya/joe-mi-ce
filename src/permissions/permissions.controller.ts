import { Controller, Post, Get, Patch, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { BulkCreatePermissionDto, PermissionResponseDto, UpdatePermissionDto } from 'dto/permissions.dto';
import { AuthGuard } from '../auth/auth.guard';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';

@UseGuards(AuthGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post('')
  @Permissions(EPermission.PERMISSION_CREATE)
  async bulkCreate(@Body() dto: BulkCreatePermissionDto) {
    return this.permissionsService.bulkCreate(dto);
  }

  @Get()
  @Permissions(EPermission.PERMISSION_READ)
  async findAll(@Req() req: any, @Query() query) {
    const { page, limit, search, sortBy, category, type, sortOrder } = query;
    return this.permissionsService.findAll('permissions', search, page, limit, sortBy, sortOrder, [], ['name'], {});
  }

  @Get(':id')
  @Permissions(EPermission.PERMISSION_READ)
  async findOne(@Param('id') id: number) {
    return this.permissionsService.findOne(id);
  }

  @Patch(':id')
  @Permissions(EPermission.PERMISSION_UPDATE)
  async update(@Param('id') id: number, @Body() dto: UpdatePermissionDto) {
    return this.permissionsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(EPermission.PERMISSION_DELETE)
  async remove(@Param('id') id: number) {
    return this.permissionsService.remove(id);
  }
}
