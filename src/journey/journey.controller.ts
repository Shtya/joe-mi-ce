// src/journey/journey.controller.ts
// ===== journey.controller.ts =====
import { Controller, Get, Post, Body, Param, Delete,Headers, UseGuards, Req, Query, Patch, UploadedFile, UseInterceptors, NotFoundException, Res } from '@nestjs/common';
import { Response } from 'express';
import { JourneyService } from './journey.service';
import { AuthGuard } from '../auth/auth.guard';
import { CreateJourneyPlanDto, CreateUnplannedJourneyDto, CheckInOutDto, UpdateJourneyDto, UpdateJourneyPlanDto } from 'dto/journey.dto';
import { EPermission } from 'enums/Permissions.enum';
import { Permissions } from 'decorators/permissions.decorators';
import { CRUD } from 'common/crud.service';
import { JourneyStatus, JourneyType } from 'entities/all_plans.entity';
import { AnyFilesInterceptor, FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { checkinDocumentUploadOptions, imageUploadOptions } from './upload.config';
import { LoggingInterceptor } from 'common/http-logging.interceptor';
import {  multerOptionsCheckinTmp } from 'common/multer.config';
import { Raw, In, Brackets } from 'typeorm';
import { UsersService } from 'src/users/users.service';
import { ERole } from 'enums/Role.enum';
@UseGuards(AuthGuard)
@Controller('journeys')
export class JourneyController {
  constructor(private readonly journeyService: JourneyService,
              private readonly usersService : UsersService
  ) {}

  // ===== Plans =====
  @Post('plans')
  @Permissions(EPermission.JOURNEY_CREATE)
  async createPlan(@Body() dto: CreateJourneyPlanDto) {
    return this.journeyService.createPlan(dto);
  }

  @Post('plans/import')
  @Permissions(EPermission.JOURNEY_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  async importPlans(
    @UploadedFile() file: Express.Multer.File,
    @Body('projectId') projectId: string
  ) {
    return this.journeyService.importPlans(file, projectId);
  }

  @Get('plans/import-template')
  async getImportTemplate(@Res() res: Response) {
    const buffer = await this.journeyService.getImportTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename=journey_plan_template.xlsx',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Patch('plans/:id')
  @Permissions(EPermission.JOURNEY_UPDATE)
  async updatePlan(@Param('id') id: string, @Body() dto:UpdateJourneyPlanDto ) {
    return this.journeyService.updatePlan(id, dto);
  }
  @Post('checkin-out')
  @UseInterceptors(FileInterceptor('file', multerOptionsCheckinTmp))
  async checkInOut(
    @Req() req: any,
    @Body() dto: CheckInOutDto,
    @Headers('lang') lang: string = 'en',
    @UploadedFile() file?: Express.Multer.File
  ) {
    if (file) {
      const filePath = `/tmp/checkins/${file.filename}`;
      if (dto.checkOutTime && !dto.checkInTime) {
        dto.checkOutDocument = filePath;
      } else {
        dto.checkInDocument = filePath;
      }
    }

    if (!dto.userId) dto.userId = req.user.id;

    return this.journeyService.checkInOut(dto, lang);
  }



  @Get('plans/project/:projectId')
@Permissions(EPermission.JOURNEY_READ)
async getPlans(
  @Query('') query: any,
  @Param('projectId') projectId: string,
  @Query('page') page: number = 1,
  @Query('limit') limit: number = 10,
  @Query('userId') userId?: string,

  @Query('search') search?: string
) {
  const filters: any = {
    projectId,
    ...query.filters,
  };

  delete filters.fromDate;
  delete filters.toDate;
  delete filters.date;

  if (userId) {
    filters.user = { id: userId };
  }





  return CRUD.findAllRelation(
    this.journeyService.journeyPlanRepo,
    'plan',
    search,
    page,
    limit,
    '',
    'DESC',
    ['user', 'branch', 'branch.city', 'branch.city.region', 'shift','journeys','journeys.checkin'],
    undefined,
    filters,
  );
}
@Get('plans/project/:projectId/supervisor')
@Permissions(EPermission.JOURNEY_READ)
async getOptimizedPlans(
  @Query('') query: any,
  @Param('projectId') projectId: string,
  @Query('page') page: number = 1,
  @Query('limit') limit: number = 10,
  @Query('userId') userId?: string,
  @Query('search') search?: string,
  @Query('date') dateParam?: string,
  @Query('fromDate') fromDateParam?: string,
  @Query('toDate') toDateParam?: string,
  @Query('branchId') branchId?: string,
  @Query('status') status?: string, // Filter by status key
  @Headers('lang') lang: string = 'en'
) {
  const filters: any = {
    projectId,
    ...query.filters,
  };

  // Clean filters
  delete filters.fromDate;
  delete filters.toDate;
  delete filters.date;

  if (userId) {
    filters.user = { id: userId };
  }

  if (branchId) {
    filters.branch = { id: branchId };
  }
  filters.user.role.name != ERole.SUPERVISOR;
  const plans = await CRUD.findAllRelation(
    this.journeyService.journeyPlanRepo,
    'plan',
    search,
    page,
    limit,
    '',
    'DESC',
    ['user', 'branch', 'branch.city', 'branch.city.region', 'shift', 'journeys', 'journeys.checkin'],
    undefined,
    filters,
  );

  // Determine date range
  let targetDates: string[] = [];

  if (fromDateParam && toDateParam) {
    // Date range filtering
    const fromDate = new Date(fromDateParam);
    const toDate = new Date(toDateParam);

    // Generate all dates in the range
    const currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      targetDates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else if (dateParam) {
    // Single date filtering (backward compatibility)
    const targetDate = new Date(dateParam);
    targetDates.push(targetDate.toISOString().split('T')[0]);
  } else {
    // Default to today
    const today = new Date();
    targetDates.push(today.toISOString().split('T')[0]);
  }

  // Define status keys for filtering (these are the values you'll use in ?status= parameter)
  const statusKeys = {
    [JourneyStatus.ABSENT]: 'absent',
    [JourneyStatus.PRESENT]: 'present',
    [JourneyStatus.CLOSED]: 'closed',
    [JourneyStatus.UNPLANNED_ABSENT]: 'unplanned-absent',
    [JourneyStatus.UNPLANNED_PRESENT]: 'unplanned-present',
    [JourneyStatus.UNPLANNED_CLOSED]: 'unplanned-closed',
  };

  // Define multilingual translations for display
  const statusTranslations = {
    [JourneyStatus.ABSENT]: { en: 'Absent', ar: 'غائب' },
    [JourneyStatus.PRESENT]: { en: 'Present', ar: 'حاضر' },
    [JourneyStatus.CLOSED]: { en: 'Closed', ar: 'مغلق' },
    [JourneyStatus.UNPLANNED_ABSENT]: { en: 'Unplanned Absent', ar: 'غائب غير مخطط' },
    [JourneyStatus.UNPLANNED_PRESENT]: { en: 'Unplanned Present', ar: 'حاضر غير مخطط' },
    [JourneyStatus.UNPLANNED_CLOSED]: { en: 'Unplanned Closed', ar: 'مغلق غير مخطط' },
  };

  // Transform and optimize the return
  let allOptimizedPlans: any[] = [];

  plans.records.forEach((plan: any) => {
    targetDates.forEach(targetDateStr => {
      const targetDate = new Date(targetDateStr);
      const targetDayOfWeek = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

      // Check if plan is active for this specific day
      const isActiveForDate = plan.days.includes(targetDayOfWeek);

      if (!isActiveForDate) {
        return; // Skip if plan not active for this day
      }

      // Find the journey for the specific date
      const journey = plan.journeys?.find((journey: any) =>
        journey.date === targetDateStr
      );

      const checkin = journey?.checkin;
      const checkInTime = checkin?.checkInTime ? new Date(checkin.checkInTime) : null;
      const checkOutTime = checkin?.checkOutTime ? new Date(checkin.checkOutTime) : null;

      // Create shift times for the target date
      const shiftStart = new Date(targetDateStr);
      const shiftEnd = new Date(targetDateStr);
      const [startHours, startMinutes, startSeconds] = plan.shift?.startTime?.split(':').map(Number) || [0, 0, 0];
      const [endHours, endMinutes, endSeconds] = plan.shift?.endTime?.split(':').map(Number) || [0, 0, 0];

      shiftStart.setHours(startHours, startMinutes, startSeconds, 0);
      shiftEnd.setHours(endHours, endMinutes, endSeconds, 0);

      // Handle shifts that cross midnight
      if (endHours < startHours) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }

      let attendanceStatus: JourneyStatus = JourneyStatus.ABSENT; // Default to ABSENT

      if (journey) {
        const journeyStatus = journey.status as JourneyStatus;

        // If journey has a status from the enum, use it
        if (Object.values(JourneyStatus).includes(journeyStatus)) {
          attendanceStatus = journeyStatus;
        } else if (journeyStatus === 'present') {
          attendanceStatus = JourneyStatus.PRESENT;
        } else if (journeyStatus === 'absent') {
          attendanceStatus = JourneyStatus.ABSENT;
        } else if (checkInTime && !checkOutTime) {
          // If checked in but not checked out
          if (journey.type === JourneyType.UNPLANNED) {
            attendanceStatus = JourneyStatus.UNPLANNED_PRESENT;
          } else {
            attendanceStatus = JourneyStatus.PRESENT;
          }
        } else if (checkInTime && checkOutTime) {
          // Both check-in and check-out completed
          if (journey.type === JourneyType.UNPLANNED) {
            attendanceStatus = JourneyStatus.UNPLANNED_PRESENT;
          } else {
            attendanceStatus = JourneyStatus.PRESENT;
          }
        }
      }

      // Get status key for filtering
      const statusKey = statusKeys[attendanceStatus];

      // Get translated status based on language parameter
      const statusTranslation = statusTranslations[attendanceStatus];
      const translatedStatus = lang === 'ar' ? statusTranslation.ar : statusTranslation.en;

      allOptimizedPlans.push({
        planId: plan.id,
        branchName: plan.branch?.name,
        branchId: plan.branch?.id,
        city: plan.branch?.city?.name,
        region: plan.branch?.city?.region?.name,
        promoterName: plan.user?.name,
        promoterId: plan.user?.id,
        shiftName: plan.shift?.name,
        days: plan.days,
        date: targetDateStr, // Add the specific date
        isActiveForDate,
        statusKey: statusKey, // The filter key: 'present', 'absent', 'unplanned_present', etc.
        attendanceStatusText: translatedStatus, // Translated text based on lang parameter
        checkInDocument: journey?.checkin?.checkInDocument,
        checkOutDocument: journey?.checkin?.checkOutDocument,
        checkInTime: checkInTime?.toISOString(),
        checkOutTime: checkOutTime?.toISOString(),
        shiftStartTime: shiftStart.toISOString(),
        shiftEndTime: shiftEnd.toISOString(),
        noteIn: journey?.checkin?.noteIn,
        noteOut: journey?.checkin?.noteOut,
        isWithinRadius: journey?.checkin?.isWithinRadius,
        journeyId: journey?.id,
        journeyStatus: journey?.status,
        journeyType: journey?.type,
        journeyDate: journey?.date,
      });
    });
  });

  let optimizedPlans = allOptimizedPlans;

  // Apply status filter if provided (filter by statusKey)
  if (status) {
    optimizedPlans = optimizedPlans.filter(plan =>
      plan.statusKey === status ||
      plan.attendanceStatus === status ||
      plan.journeyStatus === status
    );
  }

  // Get unique branches for filter options
  const branches = Array.from(new Set(
    optimizedPlans
      .filter(plan => plan.branchId && plan.branchName)
      .map(plan => ({ id: plan.branchId, name: plan.branchName }))
  ));

  // Get status options for filters (use requested language)
  const statusOptions = Object.values(JourneyStatus).map(statusValue => ({
    value: statusKeys[statusValue], // Use the status key for filtering
    label: lang === 'ar' ? statusTranslations[statusValue].ar : statusTranslations[statusValue].en,
    enumValue: statusValue // Include enum value for reference
  }));

  return {
    data: optimizedPlans,
    total: optimizedPlans.length,
    page: plans.current_page,
    limit: plans.per_page,

  };
}
@Get('plans/project/supervisor/all')
@Permissions(EPermission.JOURNEY_READ)
async getAllPlansWithPagination(
  @Query('') query: any,
  @Req() req :any,
  @Query('page') page: number = 1,
  @Query('limit') limit: number = 10,
  @Query('userId') userId?: string,
  @Query('search') search?: string,
) {
    const user = await this.usersService.resolveUserWithProject(
    req.user.id,
  );
    const projectId = await this.usersService.resolveProjectIdFromUser(
    req.user.id,
  );
  if(!projectId){
    throw new NotFoundException("the project is not assign to this user")
  }
  
  let supervisorBranchIds: string[] = [];
  if (user.role.name === ERole.SUPERVISOR) {
    const branches = await this.journeyService.getSupervisorBranches(user.id);
    if (!branches || branches.length === 0) {
      return {
        data: [],
        total: 0,
        page: page,
        limit: limit,
        totalPages: 0,
      };
    }
    supervisorBranchIds = branches.map(b => b.id);
  }

  const filters: any = {
    projectId,
    ...query.filters,
    ...(user.role.name !== ERole.SUPERVISOR && user.role.name !== ERole.PROMOTER && user.branch ? { branch: { id: user.branch.id } } : {}),
    ...(user.role.name === ERole.PROMOTER ? { user: { id: user.id } } : {}),
  };

  delete filters.fromDate;
  delete filters.toDate;
  delete filters.date;

  const extraWhere = (qb: any) => {
    if (user.role.name === ERole.SUPERVISOR) {
      qb.andWhere('plan.userId != :excludedId', { excludedId: user.id });
      // Only show plans for PROMOTERS
      qb.andWhere('plan_user_role.name = :promoterRole', { promoterRole: ERole.PROMOTER });
      
      if (supervisorBranchIds.length > 0) {
        qb.andWhere(
          new Brackets((subQb) => {
            subQb.where('plan.branchId IN (:...branchIds)', { branchIds: supervisorBranchIds })
                 .orWhere('plan_user.branchId IN (:...branchIds)', { branchIds: supervisorBranchIds });
          })
        );
      } else {
         // Should have been handled by early return, but safe fallback
         qb.andWhere('1=0'); 
      }
    }
  };

  const plans = await CRUD.findAllRelation(
    this.journeyService.journeyPlanRepo,
    'plan',
    search,
    page,
    limit,
    '', // Sort by creation date
    'DESC',
    ['user', 'user.role', 'branch', 'branch.city', 'branch.city.region', 'shift','journeys','journeys.checkin'],
    ['plan_user.name', 'plan_branch.name'],
    filters,
    extraWhere
  );

  // Transform without filtering by specific date
  const transformedPlans = plans.records.map((plan: any) => {
    // Get today's date to calculate current status
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayDayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    // Check if plan is active for today
    const isActiveForToday = plan.days.includes(todayDayOfWeek);

    // Find today's journey
    const todayJourney = plan.journeys?.find((journey: any) =>
      journey.date === todayStr
    );

    const checkin = todayJourney?.checkin;
    const checkInTime = checkin?.checkInTime ? new Date(checkin.checkInTime) : null;
    const checkOutTime = checkin?.checkOutTime ? new Date(checkin.checkOutTime) : null;

    // Calculate shift times for today
    const shiftStart = new Date(todayStr);
    const shiftEnd = new Date(todayStr);
    const [startHours, startMinutes, startSeconds] = plan.shift?.startTime?.split(':').map(Number) || [0, 0, 0];
    const [endHours, endMinutes, endSeconds] = plan.shift?.endTime?.split(':').map(Number) || [0, 0, 0];

    shiftStart.setHours(startHours, startMinutes, startSeconds, 0);
    shiftEnd.setHours(endHours, endMinutes, endSeconds, 0);

    // Handle shifts that cross midnight
    if (endHours < startHours) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    let attendanceStatus = 'Absent';

    if (todayJourney) {
      if (todayJourney.status === 'present') {
        attendanceStatus = 'Present';
      } else if (todayJourney.status === 'absent') {
        attendanceStatus = 'Absent';
      } else if (checkInTime && !checkOutTime) {
        attendanceStatus = 'Not Checked Out';
      } else if (checkInTime && checkOutTime) {
        // Check for late check-in or early check-out
        if (checkInTime > shiftStart) {
          attendanceStatus = 'Late Check-in';
        } else if (checkOutTime < shiftEnd) {
          attendanceStatus = 'Early Check-out';
        } else {
          attendanceStatus = 'Present';
        }
      }
    }

    return {
      planId: plan.id,
      branchName: plan.branch?.name,
      city: plan.branch?.city?.name,
      region: plan.branch?.city?.region?.name,
      promoterName: plan.user?.name,
      promoterId: plan.user?.id,
      shiftName: plan.shift?.name,
      days: plan.days,
      isActiveForToday, // Whether the plan is scheduled for today
      attendanceStatus, // Status field similar to first function
      checkInDocument: todayJourney?.checkin?.checkInDocument,
      checkOutDocument: todayJourney?.checkin?.checkOutDocument,
      checkInTime: checkInTime?.toISOString(),
      checkOutTime: checkOutTime?.toISOString(),
      shiftStartTime: checkInTime?.toISOString(),
      shiftEndTime: checkOutTime?.toISOString(),
      noteIn: todayJourney?.checkin?.noteIn,
      noteOut: todayJourney?.checkin?.noteOut,
      isWithinRadius: todayJourney?.checkin?.isWithinRadius,
      journeyId: todayJourney?.id,
      journeyStatus: todayJourney?.status,
      journeyDate: todayJourney?.date,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      isActive: plan.isActive, // If you have an active field
      totalJourneys: plan.journeys?.length || 0, // Total number of journeys
    };
  });


  return {
    data: transformedPlans,
    total: plans.total_records,
    page: plans.current_page,
    limit: plans.per_page,
    totalPages: Math.ceil(plans.total_records / plans.per_page),
  };
}
  @Get('plans/:id')
  @Permissions(EPermission.JOURNEY_READ)
  async getPlan(@Param('id') id: string) {
    return CRUD.findOne(this.journeyService.journeyPlanRepo, 'plans', id, ['user', 'branch', 'branch.city', 'branch.city.region', 'shift']);
  }

  @Delete('plans/:id')
  @Permissions(EPermission.JOURNEY_DELETE)
  async deletePlan(@Param('id') id: string) {
    return CRUD.softDelete(this.journeyService.journeyPlanRepo, 'plans', id);
  }

  // ===== Unplanned Journeys =====
  @Post('unplanned')
  @Permissions(EPermission.JOURNEY_CREATE)
  async createUnplannedJourney(@Body() dto: CreateUnplannedJourneyDto, @Req() req) {
    return this.journeyService.createUnplannedJourney(dto, req.user);
  }





  @Get('project/:projectId')
  @Permissions(EPermission.JOURNEY_READ)
  async getJourneys(
    @Param('projectId') projectId: string,
    @Query('') query: any,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('userId') userId?: string,
    @Query('branchId') branchId?: string,
    @Query('shiftId') shiftId?: string,
    @Query('type') type?: JourneyType,
    @Query('status') status?: JourneyStatus,
    @Query('date') _date?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
  ) {
    const filters: any = {
      projectId,
      ...query.filters,
    };
    
    // Extract dates from filters if not provided as params
    const effectiveFromDate = _date || fromDate || filters.fromDate || filters.date;
    const effectiveToDate = _date || toDate || filters.toDate || filters.date;
    
    // Clean up filters to avoid "column does not exist" error
    delete filters.fromDate;
    delete filters.toDate;
    delete filters.date;

    if (userId) filters.user = { id: userId };
    if (branchId) filters.branch = { id: branchId };
    if (shiftId) filters.shift = { id: shiftId };
    if (type) filters.type = type;
    if (status) filters.status = status;

    // Date filters mapping
    if (effectiveFromDate) filters.date_from = effectiveFromDate;
    if (effectiveToDate) filters.date_to = effectiveToDate;

    // Default behavior: if NO date filter is provided (date, fromDate, toDate), limit to <= today
    // If ANY date filter is provided, we respect that completely and do NOT enforce <= today
    const hasDateFilters = !!(_date || effectiveFromDate || effectiveToDate || filters.date);
    
    // We pass extraWhere ONLY if we need the default behavior
    const extraWhere = !hasDateFilters
      ? (qb) => {
          qb.andWhere('journey.date <= :today', { today: new Date() });
        }
      : undefined;

    return CRUD.findAllRelation(
      this.journeyService.journeyRepo,
      'journey',
      search,
      page,
      limit,
      'date',
      'DESC',
      ['user', 'branch', 'branch.city', 'branch.city.region', 'shift', 'checkin', 'branch.chain'],
      undefined,
      {
        ...filters,
        ...(userId ? { user: { id: userId } } : {}),
        ...(branchId ? { branch: { id: branchId } } : {}),
        ...(shiftId ? { shift: { id: shiftId } } : {}),
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
        // Add mapped date filters
        ...(effectiveFromDate ? { date_from: effectiveFromDate } : {}),
        ...(effectiveToDate ? { date_to: effectiveToDate } : {}),
      },
      extraWhere
    );

  }

  @Get('supervisor/checkins')
  @Permissions(EPermission.CHECKIN_READ)
  async getSupervisorCheckins(@Req() req, @Query('date') date?: string, @Query('fromDate') fromDate?: string, @Query('userId') userId?: string, @Query('toDate') toDate?: string, @Query('page') page: number = 1, @Query('limit') limit: number = 20) {
    return this.journeyService.getCheckinsForSupervisorBranches({
      supervisorId: userId || req.user.id,
      date,
      fromDate,
      toDate,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get(':id')
  @Permissions(EPermission.JOURNEY_READ)
  async getJourney(@Param('id') id: string) {
    return CRUD.findOne(this.journeyService.journeyRepo, 'journey', id, ['user', 'branch', 'branch.city', 'branch.city.region', 'shift']);
  }

  @Patch(':id')
  @Permissions(EPermission.JOURNEY_UPDATE)
  async updateJourney(@Param('id') id: string, @Body() dto: UpdateJourneyDto) {
    return this.journeyService.updateJourney(id, dto);
  }

  // ✅ Mobile: get today's journeys for logged-in user
@Get('mobile/today')
@Permissions(EPermission.JOURNEY_READ)
async getTodayJourneysForMe(
  @Req() req: any,
  @Headers('lang') lang: string = 'en',
) {
  return this.journeyService.getTodayJourneysForUserMobile(
    req.user.id,
    lang,
  );
}
  // ===== Check-in / Check-out with file upload =====


  @Get('attendance')
  @Permissions(EPermission.CHECKIN_READ)
  async getAttendanceHistory(@Query('projectId') projectId?: string, @Query('userId') userId?: string, @Query('date') date?: string, @Query('fromDate') fromDate?: string, @Query('toDate') toDate?: string) {
    return this.journeyService.getAttendanceHistory(projectId, userId, date, fromDate, toDate);
  }

  // ===== Cron test endpoint =====
  @Patch('cron/create-tomorrow')
  @Permissions(EPermission.JOURNEY_UPDATE)
  async testCronCreateTomorrow(@Body('userId') userId?: string) {
    return this.journeyService.createJourneysForTomorrow(userId);
  }

  @Patch('cron/create-today')
  @Permissions(EPermission.JOURNEY_UPDATE)
  async testCronCreateToday(@Body('userId') userId?: string) {
    return this.journeyService.createJourneysForToday(userId);
  }
}
