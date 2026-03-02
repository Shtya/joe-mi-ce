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

export class UpdatePromoterLocationDto {
  @IsOptional()
  lat: number;

  @IsOptional()
  lng: number;

  /** Link this ping to a journey for audit trail */
  @IsOptional()
  @IsString()
  journeyId?: string;

  /**
   * Original GPS timestamp — required for offline-queued pings
   * so the server stores the correct time even though it arrives late.
   */
  @IsOptional()
  @IsDateString()
  recordedAt?: string;

  /** Set true when this ping was queued while the app had no connection */
  @IsOptional()
  isOffline?: boolean;
}

export class UserStatsResponseDto {
  user: {
    id: string;
    name: string;
    username: string;
    mobile: string;
    avatar_url: string;
    role: string;
    project: string;
  };
  attendance: {
    absentDays: number;
    closedDays: number;
    lateDays: number;
  };
  sales: {
    totalSales: number;
    monthlySales: number;
    weeklySales: number;
  };
}
