// services/vacation.service.ts
import { 
  Injectable, 
  NotFoundException, 
  ConflictException, 
  BadRequestException,
  InternalServerErrorException 
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { 
  CreateVacationDto, 
  UpdateDateStatusDto,
  UpdateMultipleDatesStatusDto,
  VacationResponseDto,
  VacationSummaryResponseDto,
  VacationDateStatusSummaryDto,
  PaginatedResponseDto
} from 'dto/vacation.dto';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Vacation } from 'entities/employee/vacation.entity';
import { VacationDate } from 'entities/employee/vacation-date.entity';

@Injectable()
export class VacationService {
  constructor(
    @InjectRepository(Vacation)
    public readonly vacationRepo: Repository<Vacation>,

    @InjectRepository(VacationDate)
    public readonly vacationDateRepo: Repository<VacationDate>,

    @InjectRepository(User)
    public readonly userRepo: Repository<User>,

    @InjectRepository(Branch)
    public readonly branchRepo: Repository<Branch>,
  ) {}

  // Create a new vacation request
  async createVacation(dto: CreateVacationDto, imagePath: string | null = null) {
    try {
      const user = await this.userRepo.findOne({ 
        where: { id: dto.userId }
      });
      if (!user) {
        throw new NotFoundException(`User with id ${dto.userId} not found`);
      }

      const branch = await this.branchRepo.findOne({ 
        where: { id: dto.branchId } 
      });
      if (!branch) {
        throw new NotFoundException(`Branch with id ${dto.branchId} not found`);
      }

      const formattedDates = this.transformAndValidateDates(dto.dates);
      await this.checkForOverlappingVacations(dto.userId, formattedDates);

      const vacation = this.vacationRepo.create({
        user,
        branch,
        reason: dto.reason,
        image_url: imagePath || dto.imageUrl || null,
        overall_status: 'pending',
      });

      const savedVacation = await this.vacationRepo.save(vacation);

      const vacationDates = formattedDates.map(date => 
        this.vacationDateRepo.create({
          vacation: savedVacation,
          date,
          status: 'pending'
        })
      );

      await this.vacationDateRepo.save(vacationDates);

      return this.getVacationById(savedVacation.id);
    } catch (error) {
      if (error instanceof NotFoundException || 
          error instanceof ConflictException || 
          error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create vacation request');
    }
  }

  // Update single date status
  async updateDateStatus(vacationId: string, dto: UpdateDateStatusDto) {
    try {
      const vacation = await this.vacationRepo.findOne({
        where: { id: vacationId },
        relations: ['vacationDates']
      });

      if (!vacation) {
        throw new NotFoundException(`Vacation with id ${vacationId} not found`);
      }

      const formattedDate = this.formatDateString(dto.date);
      const vacationDate = vacation.vacationDates.find(vd => vd.date === formattedDate);

      if (!vacationDate) {
        throw new BadRequestException(`Date ${formattedDate} not found in vacation request`);
      }

      const processedBy = dto.processedById ? 
        await this.userRepo.findOne({ where: { id: dto.processedById } }) : 
        null;

      if (dto.processedById && !processedBy) {
        throw new NotFoundException(`User with id ${dto.processedById} not found`);
      }

      vacationDate.status = dto.status;
      vacationDate.processedBy = processedBy;
      vacationDate.processed_at = new Date();
      vacationDate.rejection_reason = dto.rejectionReason;

      await this.vacationDateRepo.save(vacationDate);
      await this.calculateOverallStatus(vacationId);

      return this.getVacationById(vacationId);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update date status');
    }
  }

  // Update multiple dates status
  async updateMultipleDatesStatus(vacationId: string, dto: UpdateMultipleDatesStatusDto) {
    try {
      const vacation = await this.vacationRepo.findOne({
        where: { id: vacationId },
        relations: ['vacationDates']
      });

      if (!vacation) {
        throw new NotFoundException(`Vacation with id ${vacationId} not found`);
      }

      const processedBy = dto.processedById ? 
        await this.userRepo.findOne({ where: { id: dto.processedById } }) : 
        null;

      if (dto.processedById && !processedBy) {
        throw new NotFoundException(`User with id ${dto.processedById} not found`);
      }

      for (const updateDto of dto.dateUpdates) {
        const formattedDate = this.formatDateString(updateDto.date);
        const vacationDate = vacation.vacationDates.find(vd => vd.date === formattedDate);

        if (!vacationDate) {
          throw new BadRequestException(`Date ${formattedDate} not found in vacation request`);
        }

        vacationDate.status = updateDto.status;
        vacationDate.processedBy = processedBy;
        vacationDate.processed_at = new Date();
        vacationDate.rejection_reason = updateDto.rejectionReason;

        await this.vacationDateRepo.save(vacationDate);
      }

      await this.calculateOverallStatus(vacationId);
      return this.getVacationById(vacationId);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update date statuses');
    }
  }

  // Get vacation by ID - Simple response with dates
  async getVacationById(id: string) {
    try {
      const vacation = await this.vacationRepo.findOne({
        where: { id },
        relations: [
          'user', 
          'branch', 
          'processedBy',
          'vacationDates'
        ],
        order: {
          vacationDates: {
            date: 'ASC'
          }
        }
      });

      if (!vacation) {
        throw new NotFoundException(`Vacation with id ${id} not found`);
      }

      return  vacation;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to fetch vacation');
    }
  }

  // Get all vacations by user - Simple summary with dates
  async getVacationsByUser(userId: string): Promise<VacationSummaryResponseDto[]> {
    try {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException(`User with id ${userId} not found`);
      }

      const vacations = await this.vacationRepo.find({
        where: { user: { id: userId } },
        relations: ['user', 'branch', 'vacationDates'],
        order: { created_at: 'DESC' }
      });

      return vacations.map(vacation => new VacationSummaryResponseDto(vacation));
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to fetch user vacations');
    }
  }

  // Get vacations with pagination - Simple response
  async getVacationsWithPagination(
    whereConditions: any = {},
    page: number = 1,
    limit: number = 10,
    sortBy: string = 'created_at',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
    
  ): Promise<PaginatedResponseDto<VacationSummaryResponseDto>> {
    try {
      const skip = (page - 1) * limit;
      
      const [vacations, total] = await this.vacationRepo.findAndCount({
        where: whereConditions,
        relations: ['user', 'branch', 'vacationDates'],
        order: { [sortBy]: sortOrder },
        skip,
        take: limit,
      });

      const data = vacations.map(vacation => new VacationSummaryResponseDto(vacation));
      return new PaginatedResponseDto(data, total, page, limit);
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch vacations');
    }
  }
  async getVacationsWithPaginationProject(
    whereConditions: any = {},
    page: number = 1,
    limit: number = 10,
    sortBy: string = 'created_at',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
    req:any
  ): Promise<PaginatedResponseDto<any>> {
    try {
      const skip = (page - 1) * limit;
      const user = await this.userRepo.findOne({ where: { id: req.user.id },relations:['project'] });
      if (!user) {
        throw new NotFoundException(`User with id ${req.user.id} not found`);
      }

      const [vacations, total] = await this.vacationRepo.findAndCount({
        where: {...whereConditions, user: {project: {id:  user.project.id}} },
        relations: ['user', 'branch', 'vacationDates'],
        order: { [sortBy]: sortOrder },
        skip,
        take: limit,
      });

      const data = vacations.map(vacation => new VacationSummaryResponseDto(vacation));
      return new PaginatedResponseDto(vacations, total, page, limit);
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch vacations');
    }
  }

  // Get date status summary - Simple date lists
  // async getDateStatusSummary(vacationId: string): Promise<VacationDateStatusSummaryDto> {
  //   const vacation = await this.vacationRepo.findOne({
  //     where: { id: vacationId },
  //     relations: ['vacationDates']
  //   });

  //   if (!vacation) {
  //     throw new NotFoundException(`Vacation with id ${vacationId} not found`);
  //   }

  //   const pending: string[] = [];
  //   const approved: string[] = [];
  //   const rejected: string[] = [];

  //   vacation.vacationDates.forEach(vacationDate => {
  //     switch (vacationDate.status) {
  //       case 'pending':
  //         pending.push(vacationDate.date);
  //         break;
  //       case 'approved':
  //         approved.push(vacationDate.date);
  //         break;
  //       case 'rejected':
  //         rejected.push(vacationDate.date);
  //         break;
  //     }
  //   });

  //   return new VacationDateStatusSummaryDto(pending, approved, rejected);
  // }

  // Get approved vacation dates - Simple date list
  async getApprovedVacationDates(
    userId: string, 
    startDate: string, 
    endDate: string
  ): Promise<string[]> {
    try {
      const start = this.formatDateString(startDate);
      const end = this.formatDateString(endDate);

      const startDateObj = new Date(start);
      const endDateObj = new Date(end);

      if (startDateObj > endDateObj) {
        throw new BadRequestException('Start date cannot be after end date');
      }

      const approvedDates = await this.vacationDateRepo
        .createQueryBuilder('vacationDate')
        .leftJoinAndSelect('vacationDate.vacation', 'vacation')
        .where('vacation.user_id = :userId', { userId })
        .andWhere('vacationDate.status = :status', { status: 'approved' })
        .andWhere('vacationDate.date BETWEEN :startDate AND :endDate', { 
          startDate: start, 
          endDate: end 
        })
        .orderBy('vacationDate.date', 'ASC')
        .getMany();

      return approvedDates.map(vd => vd.date);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to fetch approved vacation dates');
    }
  }

  // Private helper methods
  private async calculateOverallStatus(vacationId: string): Promise<void> {
    const vacation = await this.vacationRepo.findOne({
      where: { id: vacationId },
      relations: ['vacationDates']
    });

    if (!vacation) return;

    const totalDates = vacation.vacationDates.length;
    const approvedCount = vacation.vacationDates.filter(vd => vd.status === 'approved').length;
    const rejectedCount = vacation.vacationDates.filter(vd => vd.status === 'rejected').length;

    if (approvedCount === totalDates) {
      vacation.overall_status = 'approved';
    } else if (rejectedCount === totalDates) {
      vacation.overall_status = 'rejected';
    } else if (approvedCount > 0 || rejectedCount > 0) {
      vacation.overall_status = 'partially_approved';
    } else {
      vacation.overall_status = 'pending';
    }

    await this.vacationRepo.save(vacation);
  }

  private transformAndValidateDates(dates: any): string[] {
    if (!dates) {
      throw new BadRequestException('Dates are required');
    }

    let datesArray: string[] = [];

    if (Array.isArray(dates)) {
      datesArray = dates;
    } else if (typeof dates === 'string') {
      try {
        if (dates.startsWith('[') && dates.endsWith(']')) {
          datesArray = JSON.parse(dates);
        } else {
          datesArray = dates.split(',').map((date: string) => date.trim());
        }
      } catch (error) {
        throw new BadRequestException('Invalid dates format. Use array, JSON array, or comma-separated string');
      }
    } else {
      throw new BadRequestException('Dates must be provided as array or string');
    }

    if (datesArray.length === 0) {
      throw new BadRequestException('At least one date must be provided');
    }

    const formattedDates = datesArray.map(dateStr => {
      try {
        return this.formatDateString(dateStr);
      } catch (error) {
        throw new BadRequestException(`Invalid date format: ${dateStr}`);
      }
    });

    return [...new Set(formattedDates)].sort();
  }

  private formatDateString(dateStr: string): string {
    let date: Date;
  
    if (dateStr.includes('T')) {
      date = new Date(dateStr);
    } else if (dateStr.includes('-')) {
      const [year, month, day] = dateStr.split('-').map(Number);
      date = new Date(year, month - 1, day);
    } else if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const date1 = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
        const date2 = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        date = isNaN(date1.getTime()) ? date2 : date1;
      } else {
        throw new Error('Invalid date format');
      }
    } else {
      throw new Error('Invalid date format');
    }

    if (isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private async checkForOverlappingVacations(userId: string, dates: string[]): Promise<void> {
    const overlappingDates = await this.vacationDateRepo
      .createQueryBuilder('vacationDate')
      .leftJoinAndSelect('vacationDate.vacation', 'vacation')
      .where('vacation.user_id = :userId', { userId })
      .andWhere('vacation.overall_status IN (:...statuses)', { 
        statuses: ['pending', 'partially_approved', 'approved'] 
      })
      .andWhere('vacationDate.date IN (:...dates)', { dates })
      .getMany();

    if (overlappingDates.length > 0) {
      const conflictingDates = overlappingDates.map(vd => vd.date);
      throw new ConflictException(
        `Vacation request conflicts with existing requests on dates: ${conflictingDates.join(', ')}`
      );
    }
  }
}