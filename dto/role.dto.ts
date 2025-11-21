import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionIds?: any[];
}

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionIds?: any[];
}

export class AddPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  permissionIds: any[];
}

export class RemovePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  permissionIds: any[];
}

export class RoleResponseDto {
  id: number;
  name: string;
  description?: string;
  permissions?: PermissionDto[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class PermissionDto {
  id: number;
  name: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class RoleListResponseDto {
  data: RoleResponseDto[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
}
