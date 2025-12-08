import { PartialType } from '@nestjs/mapped-types';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsArray, ValidateNested, IsUUID, Min, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class StockDto {
  @IsOptional()
  @IsUUID()
  branch_id?: string;

  @IsNumber()
  @Min(0)
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsBoolean()
  all_branches?: boolean;

  // Add validation to ensure either branch_id OR all_branches is provided
  constructor() {
 
    // You can add custom validation decorators if needed
  }
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
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
  is_active?: boolean = true;

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
  @ValidateNested({ each: true })
  @Type(() => StockDto)
  stock?: StockDto[];
}

// Add custom validator for StockDto
export function ValidateStock() {
  return function (object: any, propertyName: string) {
    const validate = function (value: StockDto[]) {
      if (!value) return true;
      
      for (const stock of value) {
        if (!stock.all_branches && !stock.branch_id) {
          throw new Error('Either branch_id must be provided or all_branches must be true');
        }
        if (stock.all_branches && stock.branch_id) {
          throw new Error('Cannot specify both branch_id and all_branches=true');
        }
      }
      return true;
    };
    
    // Register the validator
    // You can use class-validator's @Validate decorator with a custom class
  };
}
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class GetProductsByBranchDto {
  @IsUUID()
  @IsNotEmpty()
  branch_id: string;
}
