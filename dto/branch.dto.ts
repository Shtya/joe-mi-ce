// dto/create-branch.dto.ts
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

class GeoDto {
  lat: number;
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
  geo: string;

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
  teamIds?: string[];
}


import { PartialType } from '@nestjs/mapped-types';
 
export class UpdateBranchDto extends PartialType(CreateBranchDto) {}