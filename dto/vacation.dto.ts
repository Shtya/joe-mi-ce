// dto/vacation.dto.ts
import { 
  IsString, 
  IsEnum, 
  IsUUID, 
  IsOptional, 
  IsArray,
  IsNotEmpty,
  ValidateNested,
  IsEmpty
} from 'class-validator';
import { Type } from 'class-transformer';

// ==================== REQUEST DTOs ====================

export class CreateVacationDto {
  
  @IsEmpty()
  userId: string;

  @IsUUID()
  @IsNotEmpty()
  branchId: string;
  @IsNotEmpty()
  @Type(() => String)
  dates: string[];

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;
}

export class UpdateDateStatusDto {


  @IsEnum(['approved', 'rejected'])
  overall_status: 'approved' | 'rejected';

  @IsUUID()
  @IsOptional()
  processedById?: string;

  @IsString()
  @IsOptional()
  rejectionReason?: string;
}

export class UpdateMultipleDatesStatusDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateDateStatusDto)
  dateUpdates: UpdateDateStatusDto[];

  @IsUUID()
  @IsOptional()
  processedById?: string;
}

export class VacationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  sortBy?: string = 'created_at';

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

export class ApprovedDatesQueryDto {
  @IsString()
  @IsNotEmpty()
  startDate: string;

  @IsString()
  @IsNotEmpty()
  endDate: string;
}

// ==================== RESPONSE DTOs ====================

export class VacationDateWithStatusDto {
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  processedBy?: string;
  processedByName?: string;
  processedAt?: Date;
  rejectionReason?: string;

  constructor(vacationDate: any) {
    this.date = vacationDate.date;
    this.status = vacationDate.status;
    this.processedBy = vacationDate.processedBy?.id;
    this.processedByName = vacationDate.processedBy ? 
      `${vacationDate.processedBy.first_name} ${vacationDate.processedBy.last_name}` : 
      undefined;
    this.processedAt = vacationDate.processed_at;
    this.rejectionReason = vacationDate.rejection_reason;
  }
}

export class VacationResponseDto {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  branchId: string;
  branchName: string;
  reason: string;
  imageUrl?: string;
  overallStatus: string;
  dates: VacationDateWithStatusDto[]; // Each date with status
  createdAt: Date;
  updatedAt: Date;
  processedBy?: string;
  processedByName?: string;
  rejectionReason?: string;

  constructor(vacation: any) {
    this.id = vacation.id;
    this.userId = vacation.user?.id;
    this.userName = `${vacation.user?.first_name || ''} ${vacation.user?.last_name || ''}`.trim();
    this.userEmail = vacation.user?.email;
    this.branchId = vacation.branch?.id;
    this.branchName = vacation.branch?.name;
    this.reason = vacation.reason;
    this.imageUrl = vacation.image_url;
    this.overallStatus = vacation.overall_status;
    this.createdAt = vacation.created_at;
    this.updatedAt = vacation.updated_at;
    this.processedBy = vacation.processedBy?.id;
    this.processedByName = vacation.processedBy ? 
      `${vacation.processedBy.first_name} ${vacation.processedBy.last_name}` : 
      undefined;
    this.rejectionReason = vacation.rejection_reason;

    // Transform vacation dates with status
    this.dates = vacation.vacationDates?.map((date: any) => new VacationDateWithStatusDto(date)) || [];
  }
}

export class VacationSummaryResponseDto {
  id: string;
  userId: string;
  userName: string;
  branchId: string;
  branchName: string;
  reason: string;
  imageUrl?: string;
  overallStatus: string;
  totalDates: number;
  approvedDates: number;
  pendingDates: number;
  rejectedDates: number;
  dates: VacationDateWithStatusDto[]; // All dates with their status
  createdAt: Date;
  updatedAt: Date;

  constructor(vacation: any) {
    this.id = vacation.id;
    this.userId = vacation.user?.id;
    this.userName = `${vacation.user?.username}`
    this.branchId = vacation.branch?.id;
    this.branchName = vacation.branch?.name;
    this.reason = vacation.reason;
    this.imageUrl = vacation.image_url;
    this.overallStatus = vacation.overall_status;
    this.createdAt = vacation.created_at;
    this.updatedAt = vacation.updated_at;

    const vacationDates = vacation.vacationDates || [];
    
    // All dates with their status
    this.dates = vacationDates.map((date: any) => new VacationDateWithStatusDto(date));
    
    // Statistics
    this.totalDates = this.dates.length;
    this.approvedDates = this.dates.filter(date => date.status === 'approved').length;
    this.pendingDates = this.dates.filter(date => date.status === 'pending').length;
    this.rejectedDates = this.dates.filter(date => date.status === 'rejected').length;
  }
}

export class VacationDateStatusSummaryDto {
  pending: VacationDateWithStatusDto[];
  approved: VacationDateWithStatusDto[];
  rejected: VacationDateWithStatusDto[];

  constructor(vacationDates: any[]) {
    const dates = vacationDates.map(date => new VacationDateWithStatusDto(date));
    
    this.pending = dates.filter(date => date.status === 'pending');
    this.approved = dates.filter(date => date.status === 'approved');
    this.rejected = dates.filter(date => date.status === 'rejected');
  }
}

export class ApprovedVacationDatesWithStatusDto {
  date: string;
  status: string;
  vacationId: string;
  reason: string;
  userName: string;
  branchName: string;
  processedByName?: string;
  processedAt?: Date;

  constructor(vacationDate: any) {
    this.date = vacationDate.date;
    this.status = vacationDate.status;
    this.vacationId = vacationDate.vacation?.id;
    this.reason = vacationDate.vacation?.reason;
    this.userName = `${vacationDate.vacation?.user?.first_name || ''} ${vacationDate.vacation?.user?.last_name || ''}`.trim();
    this.branchName = vacationDate.vacation?.branch?.name;
    this.processedByName = vacationDate.processedBy ? 
      `${vacationDate.processedBy.first_name} ${vacationDate.processedBy.last_name}` : 
      undefined;
    this.processedAt = vacationDate.processed_at;
  }
}

export class UserVacationStatsDto {
  userId: string;
  userName: string;
  totalVacations: number;
  approvedVacations: number;
  pendingVacations: number;
  rejectedVacations: number;
  totalDates: number;
  approvedDates: number;
  pendingDates: number;
  rejectedDates: number;
  upcomingDates: VacationDateWithStatusDto[];

  constructor(stats: any) {
    this.userId = stats.userId;
    this.userName = stats.userName;
    this.totalVacations = stats.totalVacations || 0;
    this.approvedVacations = stats.approvedVacations || 0;
    this.pendingVacations = stats.pendingVacations || 0;
    this.rejectedVacations = stats.rejectedVacations || 0;
    this.totalDates = stats.totalDates || 0;
    this.approvedDates = stats.approvedDates || 0;
    this.pendingDates = stats.pendingDates || 0;
    this.rejectedDates = stats.rejectedDates || 0;
    this.upcomingDates = stats.upcomingDates || [];
  }
}

export class PaginatedResponseDto<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data;
    this.meta = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    };
  }
}
