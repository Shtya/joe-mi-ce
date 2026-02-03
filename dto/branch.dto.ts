// dto/create-branch.dto.ts
import { Type } from 'class-transformer';


import { PartialType } from '@nestjs/mapped-types';
import { SalesTargetType } from 'entities/sales-target.entity';

import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class GeoDto {

  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;
}



export class AssignPromoterDto {
  @IsUUID()
  promoterId: any;
}

export class CreateBranchDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  geo: any;


  @IsNumber()
  @IsOptional()
  geofence_radius_meters?: number = 500;

  @IsString()
  @IsOptional()
  image_url?: string;

  @IsString()
  cityId: string;

  @IsString()
  @IsOptional()
  chainId?: string;

   @IsString()
  @IsOptional()
  supervisorId?: string;

  @IsArray()
  @IsOptional()
  supervisorIds?: string[];

  @IsArray()
  @IsOptional()
  teamIds?: string[];

  salesTargetType?: SalesTargetType;
  autoCreateSalesTargets?: boolean;
  defaultSalesTargetAmount?: number;
}

export class UpdateBranchDto extends PartialType(CreateBranchDto) {}