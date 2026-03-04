// src/journey/journey.controller.ts
// ===== journey.controller.ts =====
import { Controller, Get, Post, Body, Param, Delete,Headers, UseGuards, Req, Query, Patch, UploadedFile, UseInterceptors, NotFoundException, Res } from '@nestjs/common';
import { Response } from 'express';
import { JourneyService } from './journey.service';
import { AuthGuard } from '../auth/auth.guard';
import { CreateJourneyPlanDto, CreateUnplannedJourneyDto, CheckInOutDto, UpdateJourneyDto, UpdateJourneyPlanDto, AdminCheckInOutDto } from 'dto/journey.dto';
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
import { toLocalISOString } from 'common/date.util';
import * as dayjs from 'dayjs';
@UseInterceptors(LoggingInterceptor)
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

  @Patch('admin/fix-night-shift')
  @Permissions(EPermission.JOURNEY_UPDATE)
  async fixNightShiftJourneys(@Body('date') date?: string) {
    return this.journeyService.fixNightShiftJourneys(date);
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
      const filePath = `tmp/checkins/${file.filename}`;
      if (dto.checkOutTime && !dto.checkInTime) {
        dto.checkOutDocument = filePath;
      } else {
        dto.checkInDocument = filePath;
      }
    }

    if (!dto.userId) dto.userId = req.user.id;

    return this.journeyService.checkInOut(dto, lang);
  }

  @Post('admin/check-in')
  @Permissions(EPermission.JOURNEY_UPDATE)
  async adminCheckIn(
    @Body() dto: AdminCheckInOutDto,
    @Req() req: any,
  ) {
    if (!dto.checkInTime) {
       dto.checkInTime = new Date().toISOString();
    }
    return this.journeyService.adminCheckInOut(dto, req.user, );
  }

  @Post('admin/check-out')
  @Permissions(EPermission.JOURNEY_UPDATE)
  async adminCheckOut(
    @Body() dto: AdminCheckInOutDto,
    @Req() req: any,
  ) {
     if (!dto.checkOutTime) {
       dto.checkOutTime = new Date().toISOString();
    }
    return this.journeyService.adminCheckInOut(dto, req.user, );
  }

  @Patch('admin/remove-checkout/:journeyId')
  @Permissions(EPermission.JOURNEY_UPDATE)
  async adminRemoveCheckout(
    @Param('journeyId') journeyId: string,

  ) {
    return this.journeyService.adminRemoveCheckout(journeyId);
  }

  @Patch('admin/remove-checkin/:journeyId')
  @Permissions(EPermission.JOURNEY_UPDATE)
  async adminRemoveCheckin(
    @Param('journeyId') journeyId?: string,
  ) {
    return this.journeyService.adminRemoveCheckin( journeyId);
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
    filters.user = { ...filters.user, id: userId };
  }

  if (filters.role) {
    filters.user = { ...filters.user, role: filters.role };
    delete filters.role;
  }

  return CRUD.findAllRelation(
    this.journeyService.journeyPlanRepo,
    'plan',
    search,
    page,
    limit,
    '',
    'DESC',
    ['user', 'user.role', 'branch', 'branch.city', 'branch.city.region', 'shift','journeys','journeys.checkin'],
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

  // Handle status filter from query body if not present in query params
  if (!status) {
    if (filters.status?.id) {
      status = filters.status.id;
    } else if (typeof filters.status === 'string') {
      status = filters.status;
    }
  }

  // Clean filters
  delete filters.fromDate;
  delete filters.toDate;
  delete filters.date;
  delete filters.status;

  if (userId) {
    filters.user = { ...filters.user, id: userId };
  }

  if (branchId) {
    filters.branch = { ...filters.branch, id: branchId };
  }

  if (filters.role) {
    filters.user = { ...filters.user, role: filters.role };
    delete filters.role;
  }

  const plans = await CRUD.findAllRelation(
    this.journeyService.journeyPlanRepo,
    'plan',
    search,
    page,
    limit,
    '',
    'DESC',
    ['user', 'user.role', 'branch', 'branch.city', 'branch.city.region', 'shift', 'journeys', 'journeys.checkin'],
    undefined,
    filters,
  );

  // Determine date range
  let targetDates: string[] = [];

  const startStr = fromDateParam || dateParam;
  const endStr = toDateParam || dateParam;

  if (startStr || endStr) {
    const todayStr = new Date().toISOString().split('T')[0];
    const fromDate = new Date(startStr || endStr);
    const toDate = new Date(endStr || todayStr);

    const currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      targetDates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
      if (targetDates.length > 31) break; // Safety limit
    }
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
    [JourneyStatus.VACATION]: 'vacation',
    [JourneyStatus.UNPLANNED_ABSENT]: 'unplanned-absent',
    [JourneyStatus.UNPLANNED_PRESENT]: 'unplanned-present',
    [JourneyStatus.UNPLANNED_CLOSED]: 'unplanned-closed',
  };

  // Define multilingual translations for display
  const statusTranslations = {
    [JourneyStatus.ABSENT]: { en: 'Absent', ar: 'غائب' },
    [JourneyStatus.PRESENT]: { en: 'Present', ar: 'حاضر' },
    [JourneyStatus.CLOSED]: { en: 'Closed', ar: 'مغلق' },
    [JourneyStatus.VACATION]: { en: 'Vacation', ar: 'إجازة' },
    [JourneyStatus.UNPLANNED_ABSENT]: { en: 'Unplanned Absent', ar: 'غائب غير مخطط' },
    [JourneyStatus.UNPLANNED_PRESENT]: { en: 'Unplanned Present', ar: 'حاضر غير مخطط' },
    [JourneyStatus.UNPLANNED_CLOSED]: { en: 'Unplanned Closed', ar: 'مغلق غير مخطط' },
    // Calculated statuses mapping
    'late check-in': { en: 'Late Check-in', ar: 'تسجيل دخول متأخر' },
    'early check-out': { en: 'Early Check-out', ar: 'تسجيل خروج مبكر' },
    'not checked out': { en: 'Not Checked Out', ar: 'لم يتم تسجيل الخروج' },
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
        checkInTime: toLocalISOString(checkInTime),
        checkOutTime: toLocalISOString(checkOutTime),
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
  @Query('branchId') branchId?: string,
  @Query('status') status?: string,
  @Query('fromDate') fromDate?: string,
  @Query('toDate') toDate?: string,
  @Query('search') search?: string,
  @Headers('lang') lang: string = 'en',
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
  
  const statusTranslations: any = {
    [JourneyStatus.ABSENT]: { en: 'Absent', ar: 'غائب' },
    [JourneyStatus.PRESENT]: { en: 'Present', ar: 'حاضر' },
    [JourneyStatus.CLOSED]: { en: 'Closed', ar: 'مغلق' },
    [JourneyStatus.VACATION]: { en: 'Vacation', ar: 'إجازة' },
    [JourneyStatus.UNPLANNED_ABSENT]: { en: 'Unplanned Absent', ar: 'غائب غير مخطط' },
    [JourneyStatus.UNPLANNED_PRESENT]: { en: 'Unplanned Present', ar: 'حاضر غير مخطط' },
    [JourneyStatus.UNPLANNED_CLOSED]: { en: 'Unplanned Closed', ar: 'مغلق غير مخطط' },

  };

  const getTranslatedStatus = (status: string, language: string) => {
    const normalized = status?.toLowerCase();
    if (statusTranslations[normalized]) {
      return statusTranslations[normalized][language] || statusTranslations[normalized]['en'];
    }
    // Fallback: capitalize and return
    return status.split(/[_\s-]/).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  };

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

  // Parse dates robustly using dayjs
  const parseDate = (d?: string) => {
    if (!d) return null;
    // Try DD-MM-YYYY first then fallback to default parsing (ISO)
    const parsed = dayjs(d, ['DD-MM-YYYY', 'YYYY-MM-DD', 'D-M-YYYY'], true);
    return parsed.isValid() ? parsed : dayjs(d);
  };

  const parsedFrom = parseDate(fromDate);
  const parsedTo = parseDate(toDate);
  
  const fromDateStr = parsedFrom?.format('YYYY-MM-DD');
  const toDateStr = parsedTo?.format('YYYY-MM-DD');

  const filters: any = {
    projectId,
    ...query.filters,
    ...(user.role.name !== ERole.SUPERVISOR && user.role.name !== ERole.PROMOTER && user.branch ? { branch: { ...query.filters?.branch, id: user.branch.id } } : {}),
    ...(user.role.name === ERole.PROMOTER ? { user: { ...query.filters?.user, id: user.id } } : {}),
  };

  if (userId) {
    filters.user = { ...filters.user, id: userId };
  }

  if (branchId) {
    filters.branch = { ...filters.branch, id: branchId };
  }

  if (filters.role) {
    filters.user = { ...filters.user, role: filters.role };
    delete filters.role;
  }

  delete filters.fromDate;
  delete filters.toDate;
  delete filters.date;

  const extraWhere = (qb: any) => {
    if (user.role.name === ERole.SUPERVISOR) {
      qb.andWhere('plan.userId != :excludedId', { excludedId: user.id });
      qb.andWhere('plan_user_role.name = :promoterRole', { promoterRole: ERole.PROMOTER });
      
      if (supervisorBranchIds.length > 0) {
        qb.andWhere(
          new Brackets((subQb) => {
            subQb.where('plan.branchId IN (:...branchIds)', { branchIds: supervisorBranchIds })
                 .orWhere('plan_user.branchId IN (:...branchIds)', { branchIds: supervisorBranchIds });
          })
        );
      } else {
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
    '', 
    'DESC',
    ['user', 'user.role', 'branch', 'branch.city', 'branch.city.region', 'shift','journeys','journeys.checkin'],
    ['plan_user.name', 'plan_branch.name'],
    filters,
    extraWhere
  );

  // Generate matching dates in the range
  const startDate = parsedFrom?.isValid() ? parsedFrom : dayjs();
  const endDate = parsedTo?.isValid() ? parsedTo : startDate;
  
  const datesInRange: string[] = [];
  let current = startDate.clone();
  while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
    datesInRange.push(current.format('YYYY-MM-DD'));
    current = current.add(1, 'day');
    if (datesInRange.length > 31) break; // Safety limit
  }

  const transformedData: any[] = [];
  plans.records.forEach((plan: any) => {
    datesInRange.forEach(dateStr => {
      const d = dayjs(dateStr);
      const dayOfWeek = d.format('dddd').toLowerCase();
      const isActiveForDate = plan.days.includes(dayOfWeek);
      const journey = plan.journeys?.find((j: any) => j.date === dateStr);
      
      // If not active for today and no journey exists, skip this date row
      if (!isActiveForDate && !journey) return;

      const checkin = journey?.checkin;
      const checkInTime = checkin?.checkInTime ? new Date(checkin.checkInTime) : null;
      const checkOutTime = checkin?.checkOutTime ? new Date(checkin.checkOutTime) : null;

      // Planned shift times for this date
      const shiftStart = d.clone().startOf('day');
      const shiftEnd = d.clone().startOf('day');
      const [startH, startM, startS] = plan.shift?.startTime?.split(':').map(Number) || [0, 0, 0];
      const [endH, endM, endS] = plan.shift?.endTime?.split(':').map(Number) || [0, 0, 0];
      shiftStart.set('hour', startH).set('minute', startM).set('second', startS);
      shiftEnd.set('hour', endH).set('minute', endM).set('second', endS);
      if (endH < startH) shiftEnd.add(1, 'day');

      // Calculate attendance status
      let attendanceStatus = 'Absent';
      if (journey) {
        if (journey.status === 'present') {
          attendanceStatus = 'Present';
        } else if (journey.status === 'absent') {
          attendanceStatus = 'Absent';
        } else if (checkInTime && !checkOutTime) {
          attendanceStatus = 'Not Checked Out';
        } else if (checkInTime && checkOutTime) {
          if (dayjs(checkInTime).isAfter(shiftStart)) {
            attendanceStatus = 'Late Check-in';
          } else if (dayjs(checkOutTime).isBefore(shiftEnd)) {
            attendanceStatus = 'Early Check-out';
          } else {
            attendanceStatus = 'Present';
          }
        }
      }

      const attendanceStatusEn = journey?.status ? getTranslatedStatus(journey.status, 'en') : getTranslatedStatus(attendanceStatus, 'en');
      const journeyStatusEn = journey?.status ? getTranslatedStatus(journey.status, 'en') : null;

      const finalAttendanceStatus = journey?.status ? getTranslatedStatus(journey.status, lang) : getTranslatedStatus(attendanceStatus, lang);
      const finalJourneyStatus = journey?.status ? getTranslatedStatus(journey.status, lang) : null;

      transformedData.push({
        planId: plan.id,
        branchName: plan.branch?.name,
        city: plan.branch?.city?.name,
        region: plan.branch?.city?.region?.name,
        promoterName: plan.user?.name,
        promoterId: plan.user?.id,
        shiftName: plan.shift?.name,
        days: plan.days,
        isActiveForToday: isActiveForDate, 
        attendanceStatus: finalJourneyStatus,
        attendanceStatusEn, // internal for filtering
        checkInDocument: journey?.checkin?.checkInDocument,
        checkOutDocument: journey?.checkin?.checkOutDocument,
        checkInTime: toLocalISOString(checkInTime),
        checkOutTime: toLocalISOString(checkOutTime),
        shiftStartTime: toLocalISOString(checkInTime),
        shiftEndTime: toLocalISOString(checkOutTime),
        noteIn: journey?.checkin?.noteIn,
        noteOut: journey?.checkin?.noteOut,
        isWithinRadius: journey?.checkin?.isWithinRadius,
        journeyId: journey?.id,
        journeyStatus: finalJourneyStatus,
        journeyStatusEn, // internal for filtering
        journeyDate: journey?.date || (journey?.createdAt ? dayjs(journey.createdAt).format('YYYY-MM-DD') : dateStr),
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        isActive: plan.isActive, 
        totalJourneys: plan.journeys?.length || 0,
      });
    });
  });

  let optimizedPlans = transformedData;

  // Apply status filter if provided (compare against English values for consistency)
  if (status) {
    const normalizedStatus = status.toLowerCase();
    optimizedPlans = transformedData.filter(plan => 
      plan.attendanceStatusEn.toLowerCase() === normalizedStatus || 
      plan.journeyStatusEn?.toLowerCase() === normalizedStatus
    );
  }

  // Clean up internal fields before returning
  const finalData = optimizedPlans.map(({ attendanceStatusEn, journeyStatusEn, ...rest }) => rest);

  return {
    data: finalData,
    total: status ? optimizedPlans.length : plans.total_records,
    page: plans.current_page,
    limit: plans.per_page,
    totalPages: Math.ceil((status ? optimizedPlans.length : plans.total_records) / plans.per_page),
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
    return this.journeyService.journeyPlanRepo.delete(id);
  }

  @Delete('plans/user/:userId')
  @Permissions(EPermission.JOURNEY_DELETE)
  async removeAllPlansByUser(@Param('userId') userId: string) {
    return this.journeyService.removeAllPlansByUser(userId);
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

    // Handle nested status filter (e.g. filters[status][id])
    if (filters.status && typeof filters.status === 'object' && filters.status.id) {
        filters.status = filters.status.id;
    }
    
    // Extract dates from filters if not provided as params
    const effectiveFromDate = _date || fromDate || filters.fromDate || filters.date;
    const effectiveToDate = _date || toDate || filters.toDate || filters.date;
    
    // Clean up filters to avoid "column does not exist" error
    delete filters.fromDate;
    delete filters.toDate;
    delete filters.date;

    if (userId) filters.user = { ...filters.user, id: userId };
    if (branchId) filters.branch = { ...filters.branch, id: branchId };
    if (shiftId) filters.shift = { ...filters.shift, id: shiftId };
    
    if (filters.role) {
      filters.user = { ...filters.user, role: filters.role };
      delete filters.role;
    }

    if (type) filters.type = type;
    const rawStatus = status || filters.status;
    if (rawStatus) {
      const normalized = String(rawStatus).toLowerCase().replace(/-/g, '_');
      if (normalized === 'unplanned_absent') {
        filters.status = In(['unplanned_absent', 'unplanned-absent']);
      } else if (normalized === 'unplanned_present') {
        filters.status = In(['unplanned_present', 'unplanned-present']);
      } else if (normalized === 'unplanned_closed') {
        filters.status = In(['unplanned_closed', 'unplanned-closed']);
      } else {
        filters.status = rawStatus;
      }
    }

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
      ['user', 'user.role', 'branch', 'branch.city', 'branch.city.region', 'shift', 'checkin', 'branch.chain'],
      undefined,
      filters,
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

  @Get(':id/status-check')
  @Permissions(EPermission.JOURNEY_READ)
  async validateJourneyStatus(@Param('id') id: string) {
    return this.journeyService.validateJourneyStatus(id);
  }

  @Patch(':id')
  @Permissions(EPermission.JOURNEY_UPDATE)
  async updateJourney(@Param('id') id: string, @Body() dto: UpdateJourneyDto) {
    return this.journeyService.updateJourney(id, dto);
  }

  @Delete(':id')
  @Permissions(EPermission.JOURNEY_DELETE)
  async deleteJourney(@Param('id') id: string) {
    return this.journeyService.journeyRepo.delete(id);
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

  @Patch('cron/recover')
  @Permissions(EPermission.JOURNEY_UPDATE) 
  async manualRecoverJourneys(@Body('date') date?: string) {
    return this.journeyService.recoverJourneys(date);
  }

  @Patch('cron/recover-checkin-times')
  @Permissions(EPermission.JOURNEY_UPDATE)
  async recoverCheckInTimes() {
    return this.journeyService.recoverCheckInTimes();
  }


  @Get('location/live')
  @Permissions(EPermission.JOURNEY_READ)
  async getLiveLocations(
    @Query('projectId') projectId: string,
    @Query('minutes') minutes: number = 30,
  ) {
    return this.journeyService.getActivePromoterLocations(projectId, Number(minutes));
  }

  @Get('location/log')
  @Permissions(EPermission.JOURNEY_READ)
  async getLocationLog(
    @Query('userId') userId?: string,
    @Query('journeyId') journeyId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.journeyService.getLocationLog({ userId, journeyId, fromDate, toDate });
  }
}

