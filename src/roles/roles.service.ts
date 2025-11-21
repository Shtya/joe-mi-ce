import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like } from 'typeorm';
import { CreateRoleDto, UpdateRoleDto, RoleResponseDto, RoleListResponseDto, AddPermissionsDto, RemovePermissionsDto } from 'dto/role.dto';
import { I18nService } from 'nestjs-i18n';
import { Role } from 'entities/role.entity';
import { Permission } from 'entities/permissions.entity';
import { BaseService } from 'common/base.service';

@Injectable()
export class RolesService extends BaseService<Role> {
  constructor(
    @InjectRepository(Role)
    public readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    public readonly permissionRepository: Repository<Permission>,
    readonly i18n: I18nService,
  ) {
    super(roleRepository);
  }

  async grantAllPermissions(roleId: string, merge = false) {
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException(this.i18n.t('events.errors.role_not_found'));
    }

    const allPermissions = await this.permissionRepository.find();
    if (!allPermissions.length) {
      // Optional: localized key if you have it, otherwise a simple message
      throw new NotFoundException('No permissions defined in the system.');
    }

    if (merge) {
      // union current + all (dedupe by id)
      const byId = new Map<string, Permission>();
      for (const p of [...(role.permissions ?? []), ...allPermissions]) byId.set(p.id, p);
      role.permissions = Array.from(byId.values());
    } else {
      // overwrite: set exactly ALL permissions
      role.permissions = allPermissions;
    }

    const saved = await this.roleRepository.save(role);
    return this.mapToDto(saved);
  }

  async create(dto: CreateRoleDto) {
    const existingRole = await this.roleRepository.findOne({ where: { name: dto.name } });
    if (existingRole) {
      throw new BadRequestException(this.i18n.t('events.errors.role_exists', { args: { name: dto.name } }));
    }

    const role = this.roleRepository.create({
      name: dto.name,
      description: dto.description,
    });

    if (dto.permissionIds?.length) {
      role.permissions = await this.validatePermissions(dto.permissionIds);
    }

    const savedRole = await this.roleRepository.save(role);
    return this.mapToDto(savedRole);
  }

  async update(id: any, dto: UpdateRoleDto) {
    const role = await this.roleRepository.findOne({
      where: { id },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException(this.i18n.t('events.errors.role_not_found'));
    }

    if (dto.name && dto.name !== role.name) {
      const existingRole = await this.roleRepository.findOne({ where: { name: dto.name } });
      if (existingRole) {
        throw new BadRequestException(this.i18n.t('events.errors.role_name_exists', { args: { name: dto.name } }));
      }
      role.name = dto.name;
    }

    if (dto.description) {
      role.description = dto.description;
    }

    if (dto.permissionIds) {
      role.permissions = await this.validatePermissions(dto.permissionIds);
    }

    const updatedRole = await this.roleRepository.save(role);
    return this.mapToDto(updatedRole);
  }

  async addPermissions(roleId: any, dto: AddPermissionsDto) {
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException(this.i18n.t('events.errors.role_not_found'));
    }

    const newPermissions = await this.validatePermissions(dto.permissionIds);
    const existingPermissionIds = role.permissions.map(p => p.id);
    const uniquePermissions = newPermissions.filter(p => !existingPermissionIds.includes(p.id));

    role.permissions = [...role.permissions, ...uniquePermissions];
    const updatedRole = await this.roleRepository.save(role);
    return this.mapToDto(updatedRole);
  }

  async removePermissions(roleId: any, dto: RemovePermissionsDto) {
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });

    if (!role) {
      throw new NotFoundException(this.i18n.t('events.errors.role_not_found'));
    }

    role.permissions = role.permissions.filter((p: any) => !dto.permissionIds.includes(p.id));

    const updatedRole = await this.roleRepository.save(role);
    return this.mapToDto(updatedRole);
  }

  private async validatePermissions(permissionIds: string[]): Promise<Permission[]> {
    if (!permissionIds.length) return [];

    const permissions = await this.permissionRepository.find({
      where: { id: In(permissionIds) },
    });

    if (permissions.length !== permissionIds.length) {
      const foundIds = permissions.map(p => p.id);
      const missingIds = permissionIds.filter((id: any) => !foundIds.includes(id));
      throw new NotFoundException(this.i18n.t('events.errors.permissions_not_found', { args: { ids: missingIds.join(', ') } }));
    }

    return permissions;
  }

  private mapToDto(role: Role) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions?.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
      })),
    };
  }
}
