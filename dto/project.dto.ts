import { IsString, IsOptional, IsUrl, IsNotEmpty, IsEnum, IsUUID, ValidateIf, IsBoolean, MaxLength } from 'class-validator';
import { PartialType, OmitType, IntersectionType } from '@nestjs/mapped-types';
import { ProjectStatus } from 'enums/projects.enum';
import { Expose, Type } from 'class-transformer';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(255)
  image_url?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus = ProjectStatus.ACTIVE;

  @IsOptional()
  @IsUUID()
  @ValidateIf(o => o.supervisor_id !== null)
  supervisor_id?: string | null;

  @IsOptional()
  @IsBoolean()
  is_high_priority?: boolean = false;
}

export class BaseUpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(255)
  image_url?: string;
 
}



export class UpdateProjectDto extends IntersectionType(BaseUpdateProjectDto) {}
