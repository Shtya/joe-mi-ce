import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsUUID, IsInt, IsString, IsOptional } from 'class-validator';

export class CreateStockDto {
  @IsUUID()
  @IsNotEmpty()
  product_id: string;

  @IsUUID()
  @IsNotEmpty()
  branch_id: string;

  @IsInt()
  @IsNotEmpty()
  quantity: number;

}


export class UpdateStockDto extends PartialType(CreateStockDto) {}
