import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { BulkCreatePermissionDto, PermissionResponseDto, UpdatePermissionDto } from 'dto/permissions.dto';
import { I18nService } from 'nestjs-i18n';
import { Permission } from 'entities/permissions.entity';
import { BaseService } from 'common/base.service';

@Injectable()
export class PermissionsService extends BaseService<Permission>  {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
      readonly i18n: I18nService
  ) {
    super(permissionRepository)
  }

  async bulkCreate(dto: BulkCreatePermissionDto): Promise<{
    message: string;
    data: PermissionResponseDto[];
  }> {
    const permissionNames = dto.permissions.map(p => p.name);

    const existingPermissions = await this.permissionRepository.createQueryBuilder('permission').where('LOWER(permission.name) IN (:...names)', { names: permissionNames }).getMany();

    if (existingPermissions.length > 0) {
      const existingNames = existingPermissions.map(p => p.name);
      throw new BadRequestException(
        this.i18n.t('events.permisstions.errors.permissions_exist', {
          args: { names: existingNames.join(', ') },
        })
      );
    }

    const newPermissions = this.permissionRepository.create(
      dto.permissions.map(p => ({
        ...p,
        name: p.name,
      }))
    );

    const savedPermissions :any = await this.permissionRepository.save(newPermissions);

    return {
      message: this.i18n.t('events.permisstions.success.permissions_created'),
      data: savedPermissions.map(this.mapToDto),
    };
  }
  
  async update(
    id: any,
    dto: UpdatePermissionDto
  )  {
    const permission = await this.permissionRepository.findOne({ where: { id } });
    if (!permission) {
      throw new NotFoundException(this.i18n.t('events.permisstions.errors.permission_not_found'));
    }

    if (dto.name && dto.name !== permission.name) {
      const existingPermission = await this.permissionRepository.findOne({
        where: { name: dto.name },
      });

      if (existingPermission) {
        throw new BadRequestException(this.i18n.t('events.permisstions.errors.permission_name_exists'));
      }

      permission.name = dto.name;
    }

    if (dto.description !== undefined) {
      permission.description = dto.description;
    }

    const updatedPermission = await this.permissionRepository.save(permission);

    return {
      message: this.i18n.t('events.permisstions.success.permission_updated'),
      data: this.mapToDto(updatedPermission),
    };
  }

 

  private mapToDto(permission: Permission)  {
    return {
      id: permission.id,
      name: permission.name,
      description: permission.description,
      created_at: permission.created_at,
      updated_at: permission.updated_at,
      roles:
        permission.roles?.map(role => ({
          id: role.id,
          name: role.name,
        })) || [],
    };
  }
}
