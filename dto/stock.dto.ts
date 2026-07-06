import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsUUID, IsInt, IsString, IsOptional } from 'class-validator';

export class CreateStockDto {
  @IsUUID()
  @IsNotEmpty()
  product_id: string;

  @IsUUID()
  @IsOptional()
  branch_id?: string;

  @IsOptional()
  @IsUUID(undefined, { each: true })
  branch_ids?: string[];

  @IsInt()
  @IsNotEmpty()
  quantity: number;
}
export class CreateStockForAllBranch{
    @IsUUID()
  @IsNotEmpty()
  project_id: string;
}

export class UpdateStockDto extends PartialType(CreateStockDto) {}

export class ChangeProjectByBrandDto {
  @IsUUID()
  @IsNotEmpty()
  source_project_id: string;

  @IsString()
  @IsNotEmpty()
  brand_name: string;

  @IsUUID()
  @IsNotEmpty()
  target_project_id: string;
}

export class RemoveStockWithoutNameDto {
  @IsUUID()
  @IsNotEmpty()
  project_id: string;
}
