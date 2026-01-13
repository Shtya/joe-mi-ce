import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ERole } from '../enums/Role.enum';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString() 
  @IsOptional()
  role?: string;

  @IsString()
  @IsOptional()
  mobile?: string;

  @IsString()
  @IsOptional()
  name: string;

  @IsString()
  @IsOptional()
  project_name: string;

  @IsString()
  @IsOptional()
  image_url?: string;

  // For existing projects (when not creating new project)
  @IsUUID()
  @IsOptional()
  project_id?: string;

  @IsUUID()
  @IsOptional()
  manager_id?: string;

  // Additional fields from your entity
  @IsUUID()
  @IsOptional()
  branch_id?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;
  @IsOptional()
  @IsString()
  role_id?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  mobile?: string;

  @IsOptional()
  @IsString()
  branch_id?: string;

  @IsOptional()
  @IsString()
  password?: string;
}

export class UpdateUserRoleDto {
  @IsString()
  role_id: string;
}

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsOptional()
  device_id?: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

export class ViewUserPasswordDto {
  @IsUUID()
  @IsNotEmpty()
  user_id: string;
}
