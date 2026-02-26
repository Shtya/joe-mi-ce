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
