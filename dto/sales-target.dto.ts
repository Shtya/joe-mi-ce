// sales-target.dto.ts
import { 
    IsString, 
    IsEnum, 
    IsNumber, 
    IsDate, 
    IsBoolean, 
    IsOptional, 
    IsUUID 
  } from 'class-validator';
  import { Type } from 'class-transformer';
  import { SalesTargetType, SalesTargetStatus } from '../entities/sales-target.entity';
  
  export class CreateSalesTargetDto {
    @IsString()
    name: string;
  
    @IsOptional()
    @IsString()
    description?: string;
  
    @IsEnum(SalesTargetType)
    type: SalesTargetType;
  
    @IsNumber()
    targetAmount: number;
  
    @IsDate()
    @Type(() => Date)
    startDate: Date;
  
    @IsDate()
    @Type(() => Date)
    endDate: Date;
  
    @IsOptional()
    @IsBoolean()
    autoRenew?: boolean;
  
    @IsUUID()
    branchId: string;
  }
  
  export class UpdateSalesTargetDto {
    @IsOptional()
    @IsString()
    name?: string;
  
    @IsOptional()
    @IsString()
    description?: string;
  
    @IsOptional()
    @IsNumber()
    targetAmount?: number;
  
    @IsOptional()
    @IsBoolean()
    autoRenew?: boolean;
  }
  
  export class UpdateSalesProgressDto {
    @IsNumber()
    salesAmount: number;
  }
  
  export class SalesTargetQueryDto {
    @IsOptional()
    @IsEnum(SalesTargetStatus)
    status?: SalesTargetStatus;
  
    @IsOptional()
    @IsUUID()
    branchId?: string;
  
    @IsOptional()
    @IsEnum(SalesTargetType)
    type?: SalesTargetType;
  }