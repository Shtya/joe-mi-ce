// src/journey/journey.controller.ts
// ===== journey.controller.ts =====
import { Controller, Get, Post, Body, Param, Delete, UseGuards, Req, Query, Patch, UploadedFile, UseInterceptors } from '@nestjs/common';
import { JourneyService } from './journey.service';
import { AuthGuard } from '../auth/auth.guard';
import { CreateJourneyPlanDto, CreateUnplannedJourneyDto, CheckInOutDto } from 'dto/journey.dto';
import { EPermission } from 'enums/Permissions.enum';
import { Permissions } from 'decorators/permissions.decorators';
import { CRUD } from 'common/crud.service';
import { JourneyStatus, JourneyType } from 'entities/all_plans.entity';
import { AnyFilesInterceptor, FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { checkinDocumentUploadOptions, imageUploadOptions } from './upload.config';
import { LoggingInterceptor } from 'common/http-logging.interceptor';
import {  multerOptionsCheckinTmp } from 'common/multer.config';
import { Raw } from 'typeorm';
@UseGuards(AuthGuard)
@Controller('journeys')
export class JourneyController {
  constructor(private readonly journeyService: JourneyService) {}

  // ===== Plans =====
  @Post('plans')
  @Permissions(EPermission.JOURNEY_CREATE)
  async createPlan(@Body() dto: CreateJourneyPlanDto) {
    return this.journeyService.createPlan(dto);
  }
  @Post('checkin-out')
  @UseInterceptors(FileInterceptor('file', multerOptionsCheckinTmp))
  async checkInOut(
    @Req() req: any,
    @Body() dto: CheckInOutDto,
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
  
    return this.journeyService.checkInOut(dto);
  }
  
  
  
  @Get('plans/project/:projectId')
@Permissions(EPermission.JOURNEY_READ)
async getPlans(
  @Query('') query: any,
  @Param('projectId') projectId: string,
  @Query('page') page: number = 1,
  @Query('limit') limit: number = 10,
  @Query('userId') userId?: string,
  @Query('fromDate') fromDate?: string,
  @Query('toDate') toDate?: string,
  @Query('search') search?: string
) {
  const filters: any = {
    projectId,
    ...query.filters,
  };

  if (userId) {
    filters.user = { id: userId };
  }

  // Handle date filtering - if no dates provided, default to all data up to today
  if (fromDate || toDate) {
    // Use provided dates if any
    if (fromDate) {
      filters.fromDate = fromDate;
    }
    if (toDate) {
      filters.toDate = toDate;
    }
  } else {
    // No dates provided - default to all data from the beginning until today
    // Set toDate to today
    const today = new Date();
    const todayString = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    filters.toDate = todayString;
    // fromDate remains undefined, which means "from the beginning"
  }

  
  return CRUD.findAllRelation(
    this.journeyService.journeyPlanRepo,
    'plan',
    search,
    page,
    limit,
    'fromDate',
    'DESC',
    ['user', 'branch', 'branch.city', 'branch.city.region', 'shift'],
    undefined,
    filters,
  );
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
    @Query('search') search?: string,
  ) {
    const filters: any = {
      projectId,
      ...query.filters,
    };
  
    if (userId) filters.user = { id: userId };
    if (branchId) filters.branch = { id: branchId };
    if (shiftId) filters.shift = { id: shiftId };
    if (type) filters.type = type;
    if (status) filters.status = status;
  
    // ⭐ DO NOT USE journey.date — use simple key "date"
    filters.date = Raw(alias => `${alias} <= :today`, {
      today: new Date(),
    });
    return CRUD.findAllRelation(
      this.journeyService.journeyRepo,
      'journey',
      search,
      page,
      limit,
      'date',
      'DESC',
      ['user', 'branch', 'branch.city', 'branch.city.region', 'shift'],
      undefined,
      {
        projectId,
        ...query.filters,
        ...(userId ? { user: { id: userId } } : {}),
        ...(branchId ? { branch: { id: branchId } } : {}),
        ...(shiftId ? { shift: { id: shiftId } } : {}),
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
      },
      // NEW: extra where logic
      qb => {
        qb.andWhere('journey.date <= :today', { today: new Date() });
      }
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

  // ✅ Mobile: get today's journeys for logged-in user
  @Get('mobile/today')
  @Permissions(EPermission.JOURNEY_READ)
  async getTodayJourneysForMe(@Req() req, @Query('projectId') projectId?: string) {
    return this.journeyService.getTodayJourneysForUser(req.user.id);
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
  async testCronCreateTomorrow() {
    return this.journeyService.createJourneysForTomorrow();
  }
}
