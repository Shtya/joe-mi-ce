import { PartialType } from '@nestjs/mapped-types';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsArray, ValidateNested, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

class StockDto {
  @IsOptional()
  @IsUUID()
  branch_id?: string;

  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsBoolean()
  all_branches?: boolean;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  price?: number;

  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsBoolean()
  is_high_priority?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsUUID()
  @IsNotEmpty()
  project_id: string;

  @IsOptional()
  @IsUUID()
  brand_id?: string;

  @IsUUID()
  @IsNotEmpty()
  category_id: string;

  @IsOptional()
  @IsArray()
  stock?: StockDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class GetProductsByBranchDto {
  @IsUUID()
  @IsNotEmpty()
  branch_id: string;
}
