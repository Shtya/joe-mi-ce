// services/vacation.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets, Not } from 'typeorm';
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
import { Journey, JourneyStatus } from 'entities/all_plans.entity';
import { ERole } from 'enums/Role.enum';

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

    @InjectRepository(Journey)
    public readonly journeyRepo: Repository<Journey>,
  ) {}

  // Create a new vacation request
  async createVacation(dto: CreateVacationDto, imagePath: string | null = null) {
    try {
      if(!dto.userId){
        throw new NotFoundException("there are not user")
      }
      const user = await this.userRepo.findOne({
        where: { id: dto.userId  }, relations :['branch' ,'journeys','journeys.branch']
      });
      if (!user) {
        throw new NotFoundException(`User with id ${dto.userId} not found`);
      }
      if(!dto.branchId){
        const branchId = user.branch?.id || user.journeys?.[0]?.branch?.id;
        if (!branchId) {
          throw new NotFoundException('the user is without branch');
        }
        dto.branchId = branchId;
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
        })
      );

      await this.vacationDateRepo.save(vacationDates);

      return this.getVacationById(savedVacation.id);
    } catch (error) {
      console.log(error)
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
        where: { id: vacationId, },
        relations: ['vacationDates', 'user']
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

      vacation.overall_status = dto.overall_status;
      vacation.processedBy = processedBy;

      vacation.rejection_reason = dto.rejectionReason;
      await this.vacationRepo.save(vacation);

      if (dto.overall_status === 'approved') {
        const userId = vacation.user?.id;
        const dates = vacation.vacationDates.map(vd => vd.date);
        
        if (userId && dates.length > 0) {
          await this.journeyRepo.update(
            {
              user: { id: userId },
              date: In(dates),
              status: JourneyStatus.ABSENT
            },
            { status: JourneyStatus.VACATION }
          );
        }
      }


      return this.getVacationById(vacationId);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update date status');
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

      return new VacationSummaryResponseDto(vacation);
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
      console.log(error)
      throw new InternalServerErrorException('Failed to fetch vacations');
    }
  }
 async getVacationsWithPaginationProject(
  whereConditions: any = {},
  page: number = 1,
  limit: number = 10,
  sortBy: string = 'created_at',
  sortOrder: 'ASC' | 'DESC' = 'DESC',
  req: any
) {
  try {
    const skip = (page - 1) * limit;

    const user = await this.userRepo.findOne({
      where: { id: req.user.id },
      relations: ['project', 'branch', 'branch.project', 'role'],
      select:{project:{id:true}}
    });

    if (!user) {
      throw new NotFoundException(`User with id ${req.user.id} not found`);
    }

    // 🔑 Resolve projectId safely
    const projectId =
      user.project?.id ??
      user.project_id ??
      user.branch?.project?.id;

    // 🔹 Build query
    const query = this.vacationRepo
      .createQueryBuilder('vacation')
      .leftJoinAndSelect('vacation.user', 'user')
      .leftJoinAndSelect('user.branch', 'userBranch')
      .leftJoinAndSelect('vacation.branch', 'branch')
      .leftJoinAndSelect('branch.project', 'project')
      .leftJoinAndSelect('vacation.vacationDates', 'vacationDates')
      .where('project.id = :projectId', { projectId });
    // 🔹 Apply dynamic filters
    if (whereConditions.status) {
      query.andWhere(
        'vacation.overall_status = :status',
        { status: whereConditions.status }
      );
    }

    if (whereConditions.branch?.id || whereConditions.branchId) {
      query.andWhere(
        'branch.id = :branchId',
        { branchId: whereConditions.branch?.id || whereConditions.branchId }
      );
    }

    if (whereConditions.user?.id || whereConditions.userId) {
      query.andWhere(
        'user.id = :userId',
        { userId: whereConditions.user?.id || whereConditions.userId }
      );
    }

    // 🔹 Search Filter (User, Branch, Reason)
    if (whereConditions.search) {
      const search = `%${whereConditions.search}%`;
      query.andWhere(
        new Brackets(qb => {
          qb.where('user.username ILIKE :search', { search })
            .orWhere('user.name ILIKE :search', { search })
            .orWhere('branch.name ILIKE :search', { search })
            .orWhere('vacation.reason ILIKE :search', { search });
        })
      );
    }

    // 🔹 Date Range Filter
    if (whereConditions.fromDate || whereConditions.toDate) {
      query.leftJoin('vacation.vacationDates', 'vd_filter');
      
      if (whereConditions.fromDate && whereConditions.toDate) {
        query.andWhere('vd_filter.date BETWEEN :fromDate AND :toDate', {
          fromDate: whereConditions.fromDate,
          toDate: whereConditions.toDate,
        });
      } else if (whereConditions.fromDate) {
        query.andWhere('vd_filter.date >= :fromDate', { fromDate: whereConditions.fromDate });
      } else if (whereConditions.toDate) {
        query.andWhere('vd_filter.date <= :toDate', { toDate: whereConditions.toDate });
      }
      
      // Since we join dates to filter, we might get duplicate vacations.
      // We use distinct to avoid duplicates if multiple days in a vacation match the filter.
      // However, getManyAndCount with skip/take can be tricky with joins.
      // TypeORM's query builder handles this with its inner join/select mapping usually.
    }

    // 🔹 Sorting & pagination
    query
      .orderBy(`vacation.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    const [vacations, total] = await query.getManyAndCount();

    // 🔑 Auto-assign branch if requester is supervisor and promoter has no branch
    if (user?.role?.name === ERole.SUPERVISOR) {
      await Promise.all(vacations.map(async (vacation) => {
        if (!vacation.user.branch && vacation.user.id) {
          const resolvedBranch = await this.resolveAndAssignBranchForUser(vacation.user.id);
          if (resolvedBranch) {
            vacation.user.branch = resolvedBranch;
            // Also update vacation branch if it was missing or mismatched?
            // User says "take from it the branch id and i need to assing this branch to the prmoter"
            // If the vacation itself has no branch, update it too.
            if (!vacation.branch) {
                vacation.branch = resolvedBranch;
                await this.vacationRepo.update({ id: vacation.id }, { branch: { id: resolvedBranch.id } });
            }
          }
        }
      }));
    }

    const data = vacations.map(vacation => new VacationSummaryResponseDto(vacation));
    return new PaginatedResponseDto(data, total, page, limit);
  } catch (error) {
    console.error(error);
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
        .andWhere('vacation.overall_status = :overall_status', { status: 'approved' })
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
    dateStr = this.convertArabicToWestern(dateStr);
    let date: Date;

    if (dateStr.includes('T')) {
      date = new Date(dateStr);
    } else if (dateStr.includes('-')) {
      const parts = dateStr.split('-').map(Number);
      if (parts.length === 3) {
        if (parts[0] > 1000) {
          // YYYY-MM-DD
          date = new Date(parts[0], parts[1] - 1, parts[2]);
        } else if (parts[2] > 1000) {
          // DD-MM-YYYY or MM-DD-YYYY
          const date1 = new Date(parts[2], parts[1] - 1, parts[0]);
          const date2 = new Date(parts[2], parts[0] - 1, parts[1]);
          date = isNaN(date1.getTime()) ? date2 : date1;
        } else {
          throw new Error('Invalid date format');
        }
      } else {
        throw new Error('Invalid date format');
      }
    } else if (dateStr.includes('/')) {
      const parts = dateStr.split('/').map(Number);
      if (parts.length === 3) {
        if (parts[0] > 1000) {
          // YYYY/MM/DD
          date = new Date(parts[0], parts[1] - 1, parts[2]);
        } else if (parts[2] > 1000) {
          // MM/DD/YYYY or DD/MM/YYYY
          const date1 = new Date(parts[2], parts[0] - 1, parts[1]);
          const date2 = new Date(parts[2], parts[1] - 1, parts[0]);
          date = isNaN(date1.getTime()) ? date2 : date1;
        } else {
          throw new Error('Invalid date format');
        }
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

  private convertArabicToWestern(str: string): string {
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const westernDigits = '0123456789';
    return str.replace(/[٠-٩]/g, (d) => westernDigits[arabicDigits.indexOf(d)]);
  }

  private async checkForOverlappingVacations(userId: string, dates: string[]): Promise<void> {
    const overlappingDates = await this.vacationDateRepo
      .createQueryBuilder('vacationDate')
      .leftJoinAndSelect('vacationDate.vacation', 'vacation')
      .where('vacation.user_id = :userId', { userId })
      .andWhere('vacation.overall_status IN (:...statuses)', {
        statuses: ['pending',  'approved']
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

  async resolveAndAssignBranchForUser(userId: string): Promise<Branch | null> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['branch'],
    });

    if (!user) return null;
    if (user.branch) return user.branch;

    // Resolve branch from last journey with check-in
    const lastJourneyWithCheckIn = await this.journeyRepo.findOne({
      where: {
        user: { id: userId },
        checkin: { checkInTime: Not(null as any) },
      },
      relations: ['branch'],
      order: { date: 'DESC' },
    });

    if (lastJourneyWithCheckIn && lastJourneyWithCheckIn.branch) {
      const branchId = lastJourneyWithCheckIn.branch.id;
      // Also update the user record to persist this branch assignment
      return lastJourneyWithCheckIn.branch;
    }

    return null;
  }
}