import { PartialType } from '@nestjs/mapped-types';
import { IsString, IsEnum, IsDateString, IsUUID, IsOptional } from 'class-validator';

export class UpdateVacationDto {
  @IsString()
  @IsOptional()
  reason: string;

  @IsEnum(['approved', 'rejected'])
  @IsOptional()
  status: string;

  @IsUUID()
  @IsOptional()
  processedById: string;

  @IsDateString()
  @IsOptional()
  processedAt: Date;

  @IsDateString()
  start_date: Date;

  @IsDateString()
  end_date: Date;
}

export class CreateVacationDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  branchId: string;

  @IsDateString()
  start_date: Date;

  @IsDateString()
  end_date: Date;

  @IsString()
  reason: string;
}
