import { IsUUID, IsArray, ArrayNotEmpty, IsString, IsOptional, IsDateString, IsObject } from 'class-validator';

export class CreateJourneyPlanDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  branchId: string;

  @IsUUID()
  shiftId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  days: string[];

}
export class UpdateJourneyPlanDto {
  @IsOptional()
  userId: string;

  @IsOptional()
  branchId: string;

  @IsOptional()
  shiftId: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  days: string[];

}


export class CreateUnplannedJourneyDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  branchId: string;

  @IsOptional()
  date?:string|null
  @IsUUID()
  shiftId: string;


}

export class UpdateJourneyDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class CheckInOutDto {
  @IsString()
  journeyId: string;

	@IsOptional()
  @IsString()
  userId: string;

  @IsOptional()
  @IsDateString()
  checkInTime?: string;

  @IsOptional()
  @IsDateString()
  checkOutTime?: string;

  @IsString()
  geo: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  checkInDocument?: string;

  @IsOptional()
  @IsString()
  checkOutDocument?: string;

  @IsOptional()
  @IsString()
  noteIn?: string;

  @IsOptional()
  @IsString()
  noteOut?: string;
}

export class AdminCheckInOutDto {
  @IsString()
  journeyId: string;

  @IsOptional()
  @IsDateString()
  checkInTime?: string;

  @IsOptional()
  @IsDateString()
  checkOutTime?: string;
}
