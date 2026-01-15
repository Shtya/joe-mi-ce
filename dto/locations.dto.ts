import { IsString, IsOptional, IsNotEmpty, ValidateNested, IsArray, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class CreateCountryDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class CreateRegionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUUID()
  @IsNotEmpty()
  countryId: string;
}

export class CreateCityDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUUID()
  @IsNotEmpty()
  regionId: string;
}

export class CreateChainDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}

// Bulk Create DTOs

export class BulkCreateCountriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCountryDto)
  countries: CreateCountryDto[];
}

export class BulkCreateRegionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRegionDto)
  regions: CreateRegionDto[];
}

export class BulkCreateCitiesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCityDto)
  cities: CreateCityDto[];
}

export class BulkCreateChainsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChainDto)
  chains: CreateChainDto[];
}
export class UpdateCountryDto extends PartialType(CreateCountryDto) {}
export class UpdateRegionDto extends PartialType(CreateRegionDto) {}
export class UpdateCityDto extends PartialType(CreateCityDto) {}
export class UpdateChainDto extends PartialType(CreateChainDto) {}
