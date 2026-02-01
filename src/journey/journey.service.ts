// src/journey/journey.service.ts
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, Between, In, Not } from 'typeorm';
import * as dayjs from 'dayjs';
import { CreateJourneyPlanDto, CreateUnplannedJourneyDto, CheckInOutDto, UpdateJourneyDto } from 'dto/journey.dto';

import { CheckIn, Journey, JourneyPlan, JourneyStatus, JourneyType } from 'entities/all_plans.entity';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Shift } from 'entities/employee/shift.entity';
import { getDistance } from 'geolib';
import { CRUD } from 'common/crud.service';
import { NotificationService } from 'src/notification/notification.service';

@Injectable()
export class JourneyService {
  constructor(
    @InjectRepository(JourneyPlan)
    public journeyPlanRepo: Repository<JourneyPlan>,

    @InjectRepository(Journey)
    public journeyRepo: Repository<Journey>,

    @InjectRepository(CheckIn)
    public checkInRepo: Repository<CheckIn>,

    @InjectRepository(User)
    public userRepo: Repository<User>,

    @InjectRepository(Branch)
    public branchRepo: Repository<Branch>,

    @InjectRepository(Shift)
    public shiftRepo: Repository<Shift>,

    private readonly notificationService: NotificationService,
  ) {}

  // ===== إدارة الخطط =====
  async createPlan(dto: CreateJourneyPlanDto) {
    const [user, branch, shift] = await Promise.all([
      this.userRepo.findOne({ where: { id: dto.userId } }),
      this.branchRepo.findOne({
        where: { id: dto.branchId },
        relations: ['city', 'city.region', 'project'],
      }),
      this.shiftRepo.findOne({ where: { id: dto.shiftId } }),
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (!branch) throw new NotFoundException('Branch not found');
    if (!shift) throw new NotFoundException('Shift not found');

    if (!branch.project) {
      throw new BadRequestException('Branch has no project assigned');
    }

    // ❗ Check if same plan already exists
    const existing = await this.journeyPlanRepo.find({
      where: {
        user: { id: dto.userId },
        branch: { id: dto.branchId },
        shift: { id: dto.shiftId },
      },
    });

    for (const plan of existing) {
      const overlap = plan.days.filter(d => dto.days.includes(d));
      if (overlap.length > 0) {
        throw new ConflictException({
          message: "Conflict with existing plan days",
          overlappingDays: overlap
        });
      }
    }

    const newPlan = this.journeyPlanRepo.create({
      user,
      branch,
      shift,
      projectId: branch.project.id,
      days: dto.days,
      createdBy: user,
    });

    const savedPlan = await this.journeyPlanRepo.save(newPlan);

    return savedPlan;
  }



  // ===== الرحلات الطارئة =====
async createUnplannedJourney(dto: CreateUnplannedJourneyDto, createdBy: User) {
    const today = new Date().toISOString().split('T')[0];


  const [user, branch, shift] = await Promise.all([
    this.userRepo.findOne({ where: { id: dto.userId } }),
    this.branchRepo.findOne({
      where: { id: dto.branchId },
      relations: ['city', 'city.region', 'project'],
    }),
    this.shiftRepo.findOne({ where: { id: dto.shiftId } }),
  ]);

  if (!user) throw new NotFoundException('User not found for given userId');
  if (!branch) throw new NotFoundException('Branch not found for given branchId');
  if (!shift) throw new NotFoundException('Shift not found for given shiftId');
  if (!branch.project) {
    throw new BadRequestException('Branch has no project assigned');
  }

  const existingJourney = await this.journeyRepo.findOne({
    where: {
      user: { id: dto.userId },
      date: today,
      type: JourneyType.UNPLANNED,
    },
  });

  if (existingJourney) {
    throw new ConflictException('Unplanned journey already exists for this user today');
  }

  const newJourney = this.journeyRepo.create({
    user,
    branch,
    shift,
    projectId: branch.project.id,
    date: today,
    type: JourneyType.UNPLANNED,
    status: JourneyStatus.UNPLANNED_ABSENT,
    createdBy,
  });

  return this.journeyRepo.save(newJourney);
}

async updateJourney(id: string, dto: UpdateJourneyDto) {
  const journey = await this.journeyRepo.findOne({
    where: { id },
    relations: ['user', 'branch', 'shift', 'branch.project'],
  });

  if (!journey) throw new NotFoundException('Journey not found');

  if (dto.userId) {
    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');
    journey.user = user;
  }

  if (dto.branchId) {
    const branch = await this.branchRepo.findOne({
      where: { id: dto.branchId },
      relations: ['project'],
    });
    if (!branch) throw new NotFoundException('Branch not found');
    if (!branch.project) throw new BadRequestException('Branch has no project');
    journey.branch = branch;
    journey.projectId = branch.project.id; // Update project ID as well
  }

  if (dto.shiftId) {
    const shift = await this.shiftRepo.findOne({ where: { id: dto.shiftId } });
    if (!shift) throw new NotFoundException('Shift not found');
    journey.shift = shift;
  }

  if (dto.date) {
    journey.date = dto.date;
  }

  // Check for conflicts after updates
  const conflict = await this.journeyRepo.findOne({
    where: {
      user: { id: journey.user.id },
      date: journey.date,
      shift: { id: journey.shift.id },
      id: Not(journey.id), // Exclude self
      status: Not(In([
        JourneyStatus.UNPLANNED_ABSENT,
        JourneyStatus.UNPLANNED_PRESENT,
        JourneyStatus.UNPLANNED_CLOSED,
      ])),
    },
  });

  if (conflict) {
    throw new ConflictException('A journey already exists for this user, date, and shift');
  }

  return this.journeyRepo.save(journey);
}

async getTodayJourneysForUserMobile(userId: string, lang: string = 'en') {
  const today = dayjs().format('YYYY-MM-DD');

  const journeys = await this.journeyRepo.find({
    where: {
      user: { id: userId },
      date: today,
    },
    relations: [
      'branch',
      'branch.city',
      'branch.city.region',
      'shift',
      'checkin',
    ],
    order: { created_at: 'ASC' },
  });

  // 🔑 status keys (used by frontend filters)
  const statusKeys = {
    [JourneyStatus.ABSENT]: 'absent',
    [JourneyStatus.PRESENT]: 'present',
    [JourneyStatus.CLOSED]: 'closed',
    [JourneyStatus.UNPLANNED_ABSENT]: 'unplanned_absent',
    [JourneyStatus.UNPLANNED_PRESENT]: 'unplanned_present',
    [JourneyStatus.UNPLANNED_CLOSED]: 'unplanned_closed',
  };

  // 🌍 translations
  const statusTranslations = {
    [JourneyStatus.ABSENT]: { en: 'Absent', ar: 'غائب' },
    [JourneyStatus.PRESENT]: { en: 'Present', ar: 'حاضر' },
    [JourneyStatus.CLOSED]: { en: 'Closed', ar: 'مغلق' },
    [JourneyStatus.UNPLANNED_ABSENT]: { en: 'Unplanned Absent', ar: 'غائب غير مخطط' },
    [JourneyStatus.UNPLANNED_PRESENT]: { en: 'Unplanned Present', ar: 'حاضر غير مخطط' },
    [JourneyStatus.UNPLANNED_CLOSED]: { en: 'Unplanned Closed', ar: 'مغلق غير مخطط' },
  };

  return journeys.map(journey => {
    const checkin = journey.checkin;

    const attendanceStatus: JourneyStatus =
      journey.status ?? JourneyStatus.ABSENT;

    return {
      id: journey.id,
      date: journey.date,

      branch: journey.branch,
      city: journey.branch?.city?.name,
      region: journey.branch?.city?.region?.name,

      shift: journey.shift,
      shiftStartTime: journey.shift?.startTime,
      shiftEndTime: journey.shift?.endTime,

      journeyType: journey.type,
      journeyStatus: journey.status,

      // ✅ NEW (same as supervisor)
      status: statusKeys[attendanceStatus],
      attendanceStatusText:
        lang === 'ar'
          ? statusTranslations[attendanceStatus].ar
          : statusTranslations[attendanceStatus].en,

      // check-in data
      checkInTime: checkin?.checkInTime,
      checkOutTime: checkin?.checkOutTime,
      checkInDocument: checkin?.checkInDocument,
      checkOutDocument: checkin?.checkOutDocument,
      noteIn: checkin?.noteIn,
      noteOut: checkin?.noteOut,
      isWithinRadius: checkin?.isWithinRadius,
    };
  });
}

  async getCheckinsForSupervisorBranches(params: { supervisorId: string; date?: string; fromDate?: string; toDate?: string; page?: number; limit?: number }) {
    const { supervisorId, date, fromDate, toDate, page = 1, limit = 20 } = params;

    const branches = await this.branchRepo.find({
      where: { supervisor: { id: supervisorId } },
    });

    if (!branches.length) {
      return { items: [], total: 0, page, limit };
    }

    const branchIds = branches.map(b => b.id);

    const qb = this.checkInRepo.createQueryBuilder('c').innerJoinAndSelect('c.journey', 'j').innerJoinAndSelect('j.branch', 'b').innerJoinAndSelect('j.shift', 'shift').innerJoinAndSelect('c.user', 'u').where('b.id IN (:...branchIds)', { branchIds });

    if (date) {
      qb.andWhere('j.date = :date', { date });
    } else if (fromDate && toDate) {
      qb.andWhere('j.date BETWEEN :from AND :to', { from: fromDate, to: toDate });
    }

    const total = await qb.getCount();

    const items = await qb
      .orderBy('c.checkInTime', 'DESC')
      .skip((page||1 - 1) * limit||10)
      .take(limit || 10)
      .getMany();

    return {
      items: items.map(item => ({
        item,
      })),
      total,
      page,
      limit,
    };
  }

  async checkInOut(dto: CheckInOutDto) {
    const journey = await this.journeyRepo.findOne({
      where: { id: dto.journeyId },
      relations: ['branch', 'branch.supervisor', 'shift', 'user'],
    });

    if (!journey) {
      throw new NotFoundException('Journey not found');
    }



    let checkIn = await this.checkInRepo.findOne({
      where: { journey: { id: dto.journeyId } },
    });

    const isCheckIn = !!dto.checkInTime && !dto.checkOutTime;
    const isCheckOut = !!dto.checkOutTime;
    const isUpdate = !!dto.checkInTime && !!dto.checkOutTime;

    if (checkIn) {
      if (dto.checkInTime) {
        checkIn.checkInTime = dto.checkInTime as any;
        checkIn.checkInDocument = dto.checkInDocument;
        checkIn.noteIn = dto.noteIn;
        journey.status = journey.type === JourneyType.PLANNED ? JourneyStatus.PRESENT : JourneyStatus.UNPLANNED_PRESENT;
      }

      if (dto.checkOutTime) {
        if (!checkIn.checkInTime) {
          throw new ConflictException('Cannot check out without check in');
        }
        checkIn.checkOutTime = dto.checkOutTime as any;
        checkIn.checkOutDocument = dto.checkOutDocument;
        checkIn.noteOut = dto.noteOut;
        journey.status = journey.type === JourneyType.PLANNED ? JourneyStatus.CLOSED : JourneyStatus.UNPLANNED_CLOSED;
      }

      checkIn.geo = dto.geo as any;
      checkIn.image = dto.image;
      checkIn.isWithinRadius = true;
    } else {
      if (!dto.checkInTime) {
        throw new ConflictException('Check in time is required for first time');
      }

      checkIn = this.checkInRepo.create({
        journey,
        user: journey.user,
        checkInTime: dto.checkInTime as any,
        checkOutTime: dto.checkOutTime as any,
        checkInDocument: dto.checkInDocument,
        checkOutDocument: dto.checkOutDocument,
        geo: dto.geo as any,
        image: dto.image,
        noteIn: dto.noteIn,
        noteOut: dto.noteOut,
        isWithinRadius:true,
      });

      journey.status = journey.type === JourneyType.PLANNED ? JourneyStatus.PRESENT : JourneyStatus.UNPLANNED_PRESENT;
    }

    await this.journeyRepo.save(journey);
    const savedCheckIn = await this.checkInRepo.save(checkIn);

    // 🔔 Notify supervisor if exists
    const supervisor = journey.branch?.supervisor;
    console.log(journey);
    if (supervisor) {
      const type: 'checkin' | 'checkout' | 'update' = isUpdate ? 'update' : isCheckOut ? 'checkout' : 'checkin';

      const time = type === 'checkout' ? savedCheckIn.checkOutTime : savedCheckIn.checkInTime || new Date();

      await this.notificationService.notifySupervisorOnCheckin({
        supervisorId: supervisor.id,
        branchId: journey.branch.id,
        branchName: journey.branch.name,
        promoterId: journey.user.id,
        promoterName: journey.user.name,
        journeyId: journey.id,
        type,
        time,
      });
    }

    return savedCheckIn;
  }

  // ===== سجل الحضور =====
  async getAttendanceHistory(projectId?: string, userId?: string, date?: string, fromDate?: string, toDate?: string) {
    const where: any = {};

    if (userId) where.user = { id: userId };
    if (date) where.journey = { date };
    if (fromDate && toDate) {
      where.journey = { date: Between(fromDate, toDate) };
    }
    if (projectId) {
      where.journey = {
        ...(where.journey || {}),
        projectId,
      };
    }

    const checkIns = await this.checkInRepo.find({
      where,
      relations: ['journey', 'journey.branch', 'journey.branch.city', 'journey.branch.city.region', 'journey.shift', 'user'],
      order: { checkInTime: 'DESC' },
    });

    return checkIns;
  }

  // ===== الكرون جوب =====
  async createJourneysForTomorrow(userId?: string) {
    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
    const dayName = dayjs(tomorrow).format('dddd').toLowerCase();

    const qb = this.journeyPlanRepo
      .createQueryBuilder("plan")
      .leftJoinAndSelect("plan.user", "user")
      .leftJoinAndSelect("plan.branch", "branch")
      .leftJoinAndSelect("branch.project", "project")
      .leftJoinAndSelect("plan.shift", "shift")
      .where(":dayName = ANY(plan.days)", { dayName });

    if (userId) {
      qb.andWhere("user.id = :userId", { userId });
    }

    const plans = await qb.getMany();

    let createdCount = 0;
    console.log(plans)
    for (const plan of plans) {
      const exists = await this.journeyRepo.findOne({
        where: {
          user: { id: plan.user.id },
          shift: { id: plan.shift.id },
          date: tomorrow,
          status: Not(In([
            JourneyStatus.UNPLANNED_ABSENT,
            JourneyStatus.UNPLANNED_PRESENT,
            JourneyStatus.UNPLANNED_CLOSED,
          ])),
        },
      });

      if (exists) continue;

      const journey = this.journeyRepo.create({
        user: plan.user,
        branch: plan.branch,
        shift: plan.shift,
        projectId: plan.projectId || plan.branch.project?.id,
        date: tomorrow,
        type: JourneyType.PLANNED,
        status: JourneyStatus.ABSENT,
        journeyPlan: plan,
      });

      await this.journeyRepo.save(journey);
      createdCount++;
    }

    return { createdCount, date: tomorrow };
  }


  // ===== الدوال المساعدة =====
  private isWithinGeofence(branch: Branch, geo: any): boolean {
    console.log(`branch${branch.geo}`)
    const branchCoords = this.parseLatLng(branch.geo);
    console.log(`geo :${geo}`)

    const userCoords = this.parseLatLng(geo);

    const distance = getDistance({ latitude: branchCoords.lat, longitude: branchCoords.lng }, { latitude: userCoords.lat, longitude: userCoords.lng });

    return distance <= branch.geofence_radius_meters;
  }
private parseLatLng(value: any): { lat: number; lng: number } {
if (!value || value === '') throw new BadRequestException('No geo value');

  // If string
if (typeof value === 'string') {
  // Try "lat,lng"
  const parts = value.split(',').map(s => Number(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
}
  // If object
  if (typeof value === 'object') {
    if ('lat' in value && 'lng' in value) return { lat: Number(value.lat), lng: Number(value.lng) };
    const numericProps = Object.values(value).map(Number).filter(v => !isNaN(v));
    if (numericProps.length >= 2) return { lat: numericProps[0], lng: numericProps[1] };
  }

  throw new BadRequestException('Invalid geo format');
}



// ===== الكرون جوب =====
  async createJourneysForToday(userId?: string) {
  const today = dayjs().format('YYYY-MM-DD');
  const dayName = dayjs(today).format('dddd').toLowerCase();

  // get all plans matching today's day
  const qb = this.journeyPlanRepo
    .createQueryBuilder("plan")
    .leftJoinAndSelect("plan.user", "user")
    .leftJoinAndSelect("plan.branch", "branch")
    .leftJoinAndSelect("branch.project", "project")
    .leftJoinAndSelect("plan.shift", "shift")
    .where(":dayName = ANY(plan.days)", { dayName });

  if (userId) {
    qb.andWhere("user.id = :userId", { userId });
  }

  const plans = await qb.getMany();

  let createdCount = 0;
  console.log(plans);

  for (const plan of plans) {
    const exists = await this.journeyRepo.findOne({
      where: {
        user: { id: plan.user.id },
        shift: { id: plan.shift.id },
        date: today,
        status: Not(In([
          JourneyStatus.UNPLANNED_ABSENT,
          JourneyStatus.UNPLANNED_PRESENT,
          JourneyStatus.UNPLANNED_CLOSED,
        ])),
      },
    });

    if (exists) continue;

    const journey = this.journeyRepo.create({
      user: plan.user,
      branch: plan.branch,
      shift: plan.shift,
      projectId: plan.projectId || plan.branch.project?.id,
      date: today,
      type: JourneyType.PLANNED,
      status: JourneyStatus.ABSENT,
      journeyPlan: plan,
    });

    await this.journeyRepo.save(journey);
    createdCount++;
  }

  return { createdCount, date: today };
}


}
