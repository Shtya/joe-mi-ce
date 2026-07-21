import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsNumber, Min, IsEnum, IsUUID, IsOptional, IsBoolean, IsDateString } from 'class-validator';

export class CreateSaleDto {
  @IsNumber()
  @Min(0)
  price: number;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsEnum(['completed', 'returned', 'canceled'])
  status: string;

  @IsUUID()
  productId: string;

  @IsUUID()
  userId: string;

  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsBoolean()
  isFromOrigin?: boolean = false;
}

export class UpdateSaleDto extends PartialType(CreateSaleDto) {}

export class CreateSaleForDashboardDto extends CreateSaleDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class UpdateSaleForDashboardDto extends PartialType(
  CreateSaleForDashboardDto,
) {}

export class ReassignSalesDto {
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  saleIds: string[];

  @IsUUID()
  @IsNotEmpty()
  projectId: string;
}
