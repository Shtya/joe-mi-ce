import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  // Keep like "+20", "+971", ...
  @IsString()
  @IsNotEmpty()
  @MaxLength(6)
  @Matches(/^\+\d{1,5}$/)
  countryCode: string;

  // Digits only on the backend; front can accept pretty input
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6,14}$/)
  phone: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  // Will be filled AFTER upload; don’t send from client
  @IsOptional()
  @IsString()
  proofUrl?: string;

  @IsBoolean()
  agreed: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;

  // optional: initial status guard; usually keep default at DB layer
  @IsOptional()
  @IsIn(['pending', 'verified', 'rejected'])
  status?: 'pending' | 'verified' | 'rejected';

  // optional: capture IP from request if you want to store it
  @IsOptional()
  @IsString()
  ipAddress?: string;
}

import { PartialType } from '@nestjs/mapped-types';

export class UpdateCheckoutDto extends PartialType(CreateCheckoutDto) {
  @IsOptional()
  @IsIn(['pending', 'verified', 'rejected'])
  status?: 'pending' | 'verified' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;
}
