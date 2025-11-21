import {
  IsBoolean,
  IsOptional,
  IsNumber,
  IsString,
  IsUUID,
  IsArray,
  IsEnum,
  IsDateString,
  ValidateNested,
  IsUrl,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuditStatus } from 'entities/audit.entity';

class CompetitorDto {
  @IsNumber()
  Availability: number;

  @IsString()
  competitor_id: string;

  @IsNumber()
  competitor_price: number;

  @IsNumber()
  competitor_discount: number;

  @IsArray()
  images: string[];

  @IsDateString()
  observed_at: string;
}

export class CreateAuditDto {
  @IsUUID()
  branch_id: string;

  @IsUUID()
  promoter_id: string;

  @IsUUID()
  product_id: string;

  @IsString()
  product_name: string;

  @IsOptional() @IsString()
  product_brand?: string;

  @IsOptional() @IsString()
  product_category?: string;

  @IsOptional() @IsBoolean()
  is_available?: boolean;

  @IsOptional() @IsNumber()
  current_price?: number;

  @IsOptional() @IsNumber()
  current_discount?: number;

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  image_urls?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompetitorDto)
  competitors?: CompetitorDto[];

  @IsOptional()
  @IsEnum(AuditStatus)
  status?: AuditStatus;

  // للسماح بإنشاء تدقيق لتاريخ سابق (اختياري)
  @IsOptional()
  @IsDateString()
  audit_date?: string; // YYYY-MM-DD
}



import { PartialType } from '@nestjs/mapped-types';
export class UpdateAuditDto extends PartialType(CreateAuditDto) {}

export class QueryAuditsDto {
  @IsOptional() @IsEnum(AuditStatus)
  status?: AuditStatus;

  @IsOptional() @IsUUID()
  product_id?: string;

  @IsOptional() @IsDateString()
  from_date?: string; // YYYY-MM-DD

  @IsOptional() @IsDateString()
  to_date?: string; // YYYY-MM-DD

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;
}


export class UpdateAuditStatusDto {
  @IsEnum(AuditStatus)
  status: AuditStatus;

  @IsOptional() @IsUUID()
  reviewed_by_id?: string;

  @IsOptional() @IsDateString()
  reviewed_at?: string; // ISO date string
}