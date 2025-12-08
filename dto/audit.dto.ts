// dto/audit.dto.ts
import { 
  IsString, IsNumber, IsBoolean, IsOptional, IsArray, 
  IsEnum, IsDateString, IsUUID, Min, Max, ValidateNested 
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuditStatus } from 'entities/audit.entity';

export class CreateAuditDto {
  @IsUUID()
  product_id: string;

  @IsUUID()
  branch_id: string;

  @IsBoolean()
  is_available: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  current_price?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  current_discount?: number;

  @IsString()
  @IsOptional()
  discount_reason?: string;

  @IsBoolean()
  @IsOptional()
  is_national?: boolean;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AuditCompetitorDto)
  competitors?: AuditCompetitorDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  audit_date?: string;

  @IsString()
  @IsOptional()
  projectId?: string;
}

export class UpdateAuditDto {
  @IsBoolean()
  @IsOptional()
  is_available?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  current_price?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  current_discount?: number;

  @IsString()
  @IsOptional()
  discount_reason?: string;

  @IsBoolean()
  @IsOptional()
  is_national?: boolean;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AuditCompetitorDto)
  competitors?: AuditCompetitorDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  audit_date?: string;

  @IsEnum(AuditStatus)
  @IsOptional()
  status?: AuditStatus;
}

export class AuditCompetitorDto {
  @IsUUID()
  competitor_id: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  discount?: number;

  @IsBoolean()
  @IsOptional()
  is_available?: boolean;

  @IsBoolean()
  @IsOptional()
  is_national?: boolean;

  @IsString()
  @IsOptional()
  discount_reason?: string;

  @IsDateString()
  @IsOptional()
  observed_at?: string;
}

export class QueryAuditsDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsNumber()
  @IsOptional()
  page?: number = 1;

  @IsNumber()
  @IsOptional()
  limit?: number = 10;

  @IsString()
  @IsOptional()
  sortBy?: string = 'created_at';

  @IsString()
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @IsString()
  @IsOptional()
  fromDate?: string;

  @IsString()
  @IsOptional()
  toDate?: string;

  @IsString()
  @IsOptional()
  status?: AuditStatus;

  @IsUUID()
  @IsOptional()
  branch_id?: string;

  @IsUUID()
  @IsOptional()
  promoter_id?: string;

  @IsUUID()
  @IsOptional()
  product_id?: string;

  @IsBoolean()
  @IsOptional()
  is_national?: boolean;

  @IsUUID()
  @IsOptional()
  brand_id?: string;

  @IsUUID()
  @IsOptional()
  category_id?: string;

  @IsString()
  @IsOptional()
  brand_name?: string;

  @IsString()
  @IsOptional()
  category_name?: string;

  @IsUUID()
  @IsOptional()
  project_id?: string;
}