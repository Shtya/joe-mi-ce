// dto/audit.dto.ts
import { 
  IsString, IsNumber, IsBoolean, IsOptional, IsArray, 
  IsEnum, IsDateString, IsUUID, Min, Max, ValidateNested 
} from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountReason } from 'entities/audit.entity';

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

  @IsOptional()
  @IsEnum(DiscountReason)
  discount_reason?: DiscountReason;
  @IsString()
  @IsOptional()
  discount_details?: string;
 
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AuditCompetitorDto)
  competitors?: AuditCompetitorDto[];



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

  @IsOptional()
  @IsEnum(DiscountReason)
  discount_reason?: DiscountReason;
  @IsString()
  @IsOptional()
  discount_details?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AuditCompetitorDto)
  competitors?: AuditCompetitorDto[];


  @IsDateString()
  @IsOptional()
  audit_date?: string;


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
  origin?: string;
  @IsOptional()
  @IsEnum(DiscountReason)
  discount_reason?: DiscountReason;
  @IsString()
  @IsOptional()
  discount_details?: string;
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


  @IsUUID()
  @IsOptional()
  branch_id?: string;

  @IsUUID()
  @IsOptional()
  promoter_id?: string;

  @IsUUID()
  @IsOptional()
  product_id?: string;


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