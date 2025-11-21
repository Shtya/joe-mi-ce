import { Controller, Post, Get, Patch, Delete, Param, Body, Query, UseGuards, Req, ParseBoolPipe } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto, AddPermissionsDto, RemovePermissionsDto, RoleResponseDto, RoleListResponseDto } from 'dto/role.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';

@Controller('roles')
@UseGuards(AuthGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions(EPermission.ROLE_READ)
  async findAll(@Req() req: any, @Query() query) {
    const { page, limit, search, sortBy, category, type, sortOrder } = query;
    return this.rolesService.findAll('roles', search, page, limit, sortBy, sortOrder, ['permissions'], ['name'], {});
  }
	
  @Post()
  @Permissions(EPermission.ROLE_CREATE)
  async create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Get(':name')
  @Permissions(EPermission.ROLE_READ)
  async findOne(@Param('name') name: string, @Query('') query: any) {
    const roles = this.rolesService.roleRepository.findOne({ where: { name: name }, relations: ['permissions'] });
    return roles;
  }

  @Patch(':id')
  @Permissions(EPermission.ROLE_UPDATE)
  async update(@Param('id') id: any, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Post(':id/permissions')
  @Permissions(EPermission.ROLE_PERMISSIONS_ADD)
  async addPermissions(@Param('id') roleId: string, @Body() dto: AddPermissionsDto) {
    return this.rolesService.addPermissions(roleId, dto);
  }

  @Post(':id/permissions/all')
  @Permissions(EPermission.ROLE_PERMISSIONS_ADD)
  async addAllPermissionsToRole(
    @Param('id') roleId: string,
    @Query('merge', new ParseBoolPipe({ optional: true })) merge?: boolean, // ?merge=true to union
  ) {
    return this.rolesService.grantAllPermissions(roleId, merge ?? false);
  }

  @Delete(':id/permissions')
  @Permissions(EPermission.ROLE_PERMISSIONS_REMOVE)
  async removePermissions(@Param('id') roleId: any, @Body() dto: RemovePermissionsDto) {
    return this.rolesService.removePermissions(roleId, dto);
  }

  @Delete(':id')
  @Permissions(EPermission.ROLE_DELETE)
  async delete(@Param('id') id: any) {
    return this.rolesService.remove(id);
  }
}
