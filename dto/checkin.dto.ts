import { IsDateString, IsString, IsOptional, IsNotEmpty, IsUUID } from 'class-validator';
import { GeoLocation } from 'entities/geo.embeddable';

export class CreateCheckInDto {
  @IsUUID()
  userId: string;

  
  @IsUUID()
  journeyId: string;

  @IsDateString()
  checkInTime: Date;

  @IsDateString()
  @IsOptional()
  checkOutTime?: Date;

  @IsNotEmpty()
  geo: GeoLocation;

  @IsString()
  @IsOptional()
  image?: string;

  @IsString()
  @IsOptional()
  note?: string;
}
