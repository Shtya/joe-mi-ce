// src/journey/journey.service.ts
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, Between, In, Not } from 'typeorm';
import * as dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { CreateJourneyPlanDto, CreateUnplannedJourneyDto, CheckInOutDto, UpdateJourneyDto, UpdateJourneyPlanDto, AdminCheckInOutDto } from 'dto/journey.dto';

import { CheckIn, Journey, JourneyPlan, JourneyStatus, JourneyType } from 'entities/all_plans.entity';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Shift } from 'entities/employee/shift.entity';
import { VacationDate } from 'entities/employee/vacation-date.entity';
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

    @InjectRepository(VacationDate)
    public vacationDateRepo: Repository<VacationDate>,

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
  async updatePlan(id: string, dto: UpdateJourneyPlanDto) {
    const plan = await this.journeyPlanRepo.findOne({
      where: { id },
      relations: ['user', 'branch', 'shift', 'branch.project'],
    });

    if (!plan) throw new NotFoundException('Journey plan not found');

    if (dto.userId) {
      const user = await this.userRepo.findOne({ where: { id: dto.userId } });
      if (!user) throw new NotFoundException('User not found');
      plan.user = user;
    }

    if (dto.branchId) {
      const branch = await this.branchRepo.findOne({
        where: { id: dto.branchId },
        relations: ['project'],
      });
      if (!branch) throw new NotFoundException('Branch not found');
      if (!branch.project) throw new BadRequestException('Branch has no project');
      plan.branch = branch;
      plan.projectId = branch.project.id;
    }

    if (dto.shiftId) {
      const shift = await this.shiftRepo.findOne({ where: { id: dto.shiftId } });
      if (!shift) throw new NotFoundException('Shift not found');
      plan.shift = shift;
    }

    if (dto.days) {
      plan.days = dto.days;
    }

    // ❗ Check for conflicts with other plans
    const existing = await this.journeyPlanRepo.find({
      where: {
        user: { id: plan.user.id },
        branch: { id: plan.branch.id },
        shift: { id: plan.shift.id },
        id: Not(plan.id), // Exclude self
      },
    });

    for (const otherPlan of existing) {
      const overlap = otherPlan.days.filter(d => plan.days.includes(d));
      if (overlap.length > 0) {
        throw new ConflictException({
          message: "Conflict with existing plan days",
          overlappingDays: overlap
        });
      }
    }

    return this.journeyPlanRepo.save(plan);
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
      shift:shift,
      branch:branch
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
    [JourneyStatus.VACATION]: 'vacation',
    [JourneyStatus.UNPLANNED_ABSENT]: 'unplanned-absent',
    [JourneyStatus.UNPLANNED_PRESENT]: 'unplanned-present',
    [JourneyStatus.UNPLANNED_CLOSED]: 'unplanned-closed',
  };

  // 🌍 translations
  const statusTranslations = {
    [JourneyStatus.ABSENT]: { en: 'Absent', ar: 'غائب' },
    [JourneyStatus.PRESENT]: { en: 'Present', ar: 'حاضر' },
    [JourneyStatus.CLOSED]: { en: 'Closed', ar: 'مغلق' },
    [JourneyStatus.VACATION]: { en: 'Vacation', ar: 'إجازة' },
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
      where: [
        { supervisor: { id: supervisorId } },
        { supervisors: { id: supervisorId } }
      ],
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

  async checkInOut(dto: CheckInOutDto, lang: string = 'en') {
    const journey = await this.journeyRepo.findOne({
      where: { id: dto.journeyId },
      relations: ['branch', 'branch.supervisor', 'shift', 'user', 'branch.chain'],
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

    // Check roaming settings
    const chainName = journey.branch?.chain?.name;
    
    const isCheckGeo = !chainName?.toLowerCase().includes('roaming');

    const isWithinGeofence = isCheckGeo ? this.isWithinGeofence(journey.branch, dto.geo) : true;

    if(!isWithinGeofence){
      throw new BadRequestException('You are too far from the location');
    }
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
      checkIn.isWithinRadius = isWithinGeofence;
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
        isWithinRadius: isWithinGeofence,
      });

      journey.status = journey.type === JourneyType.PLANNED ? JourneyStatus.PRESENT : JourneyStatus.UNPLANNED_PRESENT;
    }

    let savedCheckIn: CheckIn;
    await this.journeyRepo.manager.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.save(Journey, journey);
      savedCheckIn = await transactionalEntityManager.save(CheckIn, checkIn);
    });

    // 🔔 Notify supervisor if exists
    const supervisor = journey.branch?.supervisor;
    
    const type: 'checkin' | 'checkout' | 'update' = isUpdate ? 'update' : isCheckOut ? 'checkout' : 'checkin';
    const time = type === 'checkout' ? savedCheckIn.checkOutTime : savedCheckIn.checkInTime || new Date();


    const notifications = [];

    // 1. Notify Supervisor
    if (supervisor) {
      notifications.push(
        this.notificationService.notifySupervisorOnCheckin({
          supervisorId: supervisor.id,
          branchId: journey.branch.id,
          branchName: journey.branch.name,
          promoterId: journey.user.id,
          promoterName: journey.user.name,
          journeyId: journey.id,
          type,
          time,
        }, lang)
      );
    }

    // 2. Notify Promoter (User)
    notifications.push(
      this.notificationService.notifyPromoterOnCheckin({
        promoterId: journey.user.id,
        branchId: journey.branch.id,
        branchName: journey.branch.name,
        journeyId: journey.id,
        type,
        time,
      }, lang)
    );

    await Promise.all(notifications);

    if (isCheckOut) {
      return {
        code: 200,
        message: 'Checked out successfully',
        data: {
          checkOutTime: savedCheckIn.checkOutTime ? dayjs(savedCheckIn.checkOutTime).format('HH:mm') : null,
        },
      };
    }
    
    return savedCheckIn;
  }

  async adminCheckInOut(dto: AdminCheckInOutDto, adminUser: User, lang: string = 'en') {
    const journey = await this.journeyRepo.findOne({
      where: { id: dto.journeyId },
      relations: ['branch', 'branch.supervisor', 'shift', 'user', 'branch.chain'],
    });

    if (!journey) {
      throw new NotFoundException('Journey not found');
    }

    let checkIn = await this.checkInRepo.findOne({
      where: { journey: { id: dto.journeyId } },
    });

    const now = new Date(); // Represents current time (Jeddah time when deployed/configured correctly)

    if (checkIn) {
      // Update logic
      if (dto.checkInTime) {
        checkIn.checkInTime = dto.checkInTime as any;
        journey.status = journey.type === JourneyType.PLANNED ? JourneyStatus.PRESENT : JourneyStatus.UNPLANNED_PRESENT;
      }

      if (dto.checkOutTime) {
        checkIn.checkOutTime = dto.checkOutTime as any;
        journey.status = journey.type === JourneyType.PLANNED ? JourneyStatus.CLOSED : JourneyStatus.UNPLANNED_CLOSED;
      } else if (!dto.checkInTime && !checkIn.checkOutTime) {
         // Fallback: If no specific times given and journey is open, assume Check Out Now
         checkIn.checkOutTime = now;
         journey.status = journey.type === JourneyType.PLANNED ? JourneyStatus.CLOSED : JourneyStatus.UNPLANNED_CLOSED;
      }

    } else {
   
      const checkInTime = dto.checkInTime ? (dto.checkInTime as any) : now;
      
      checkIn = this.checkInRepo.create({
        journey,
        user: journey.user,
        checkInTime: checkInTime,
        checkOutTime: dto.checkOutTime as any, // Only set if provided
        checkInDocument: "",
        checkOutDocument: "",
        geo:  '', 
        image:"",
        noteIn:"",
        noteOut: "",
        isWithinRadius: true, 
      });

      journey.status = journey.type === JourneyType.PLANNED ? JourneyStatus.PRESENT : JourneyStatus.UNPLANNED_PRESENT;
    }

    let savedCheckIn: CheckIn;
    await this.journeyRepo.manager.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.save(Journey, journey);
      savedCheckIn = await transactionalEntityManager.save(CheckIn, checkIn);
    });

    // 🔔 Notify supervisor/promoter?
     const supervisor = journey.branch?.supervisor;
     // Determine type based on what actually happened
     const isCheckOut = savedCheckIn.checkOutTime && (!checkIn || !checkIn.checkOutTime); // Roughly estimates if we just checked out?
     // Actually, let's keep it simple: if we have a checkout time, we treat the state as closed.
     
     const time = savedCheckIn.checkOutTime || savedCheckIn.checkInTime;


    const notifications = [];

    // 1. Notify Supervisor
    if (supervisor) {
      notifications.push(
        this.notificationService.notifySupervisorOnCheckin({
          supervisorId: supervisor.id,
          branchId: journey.branch.id,
          branchName: journey.branch.name,
          promoterId: journey.user.id,
          promoterName: journey.user.name,
          journeyId: journey.id,
          type: 'update', 
          time,
        }, lang)
      );
    }

    // 2. Notify Promoter (User)
     notifications.push(
      this.notificationService.notifyPromoterOnCheckin({
        promoterId: journey.user.id,
        branchId: journey.branch.id,
        branchName: journey.branch.name,
        journeyId: journey.id,
        type: 'update',
        time,
      }, lang)
    );

    await Promise.all(notifications);
    
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
      .where(":dayName = ANY(plan.days)", { dayName })
      .andWhere("user.deleted_at IS NULL")
      .andWhere("branch.deleted_at IS NULL");

    if (userId) {
      qb.andWhere("user.id = :userId", { userId });
    }

    const plans = await qb.getMany();

    let createdCount = 0;
    console.log(plans)
    for (const plan of plans) {
      // Skip and Cleanup plans with missing relations
      if (!plan.user || !plan.branch || !plan.shift) {
        console.warn(`Cleaning up plan ${plan.id}: missing user, branch, or shift relation`);
        await this.journeyPlanRepo.delete(plan.id);
        continue;
      }

      const exists = await this.journeyRepo.findOne({
        where: {
          user: { id: plan.user.id },
          shift: { id: plan.shift.id },
          date: tomorrow,
          branch: { id: plan.branch.id },
        },
      });

      if (exists) continue;

      const onVacation = await this.vacationDateRepo.findOne({
        where: {
          date: tomorrow,
          vacation: {
            user: { id: plan.user.id },
            overall_status: 'approved'
          }
        }
      });

      const journey = this.journeyRepo.create({
        user: plan.user,
        branch: plan.branch,
        shift: plan.shift,
        projectId: plan.projectId || plan.branch.project?.id,
        date: tomorrow,
        type: JourneyType.PLANNED,
        status: onVacation ? JourneyStatus.VACATION : JourneyStatus.ABSENT,
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
    .where(":dayName = ANY(plan.days)", { dayName })
    .andWhere("user.deleted_at IS NULL")
    .andWhere("branch.deleted_at IS NULL");

  if (userId) {
    qb.andWhere("user.id = :userId", { userId });
  }

  const plans = await qb.getMany();

  let createdCount = 0;
  console.log(plans);

  for (const plan of plans) {
    // Skip and Cleanup plans with missing relations
    if (!plan.user || !plan.branch || !plan.shift) {
      console.warn(`Cleaning up plan ${plan.id}: missing user, branch, or shift relation`);
      await this.journeyPlanRepo.delete(plan.id);
      continue;
    }

    const exists = await this.journeyRepo.findOne({
      where: {
        user: { id: plan.user.id },
        shift: { id: plan.shift.id },
        date: today,
        branch: { id: plan.branch.id }, // ✅ Check branch to allow multiple journeys/shift
        status: Not(In([
          JourneyStatus.UNPLANNED_ABSENT,
          JourneyStatus.UNPLANNED_PRESENT,
          JourneyStatus.UNPLANNED_CLOSED,
        ])),
      },
    });

    if (exists) continue;

    const onVacation = await this.vacationDateRepo.findOne({
      where: {
        date: today,
        vacation: {
          user: { id: plan.user.id },
          overall_status: 'approved'
        }
      }
    });

    const journey = this.journeyRepo.create({
      user: plan.user,
      branch: plan.branch,
      shift: plan.shift,
      projectId: plan.projectId || plan.branch.project?.id,
      date: today,
      type: JourneyType.PLANNED,
      status: onVacation ? JourneyStatus.VACATION : JourneyStatus.ABSENT,
      journeyPlan: plan,
    });

    await this.journeyRepo.save(journey);
    createdCount++;
  }

  return { createdCount, date: today };
}

  // ===== Recovery Cron Job =====
  async recoverJourneys(date?: string) {
    const targetDate = date || dayjs().format('YYYY-MM-DD');
    const dayName = dayjs(targetDate).format('dddd').toLowerCase();

    // 1. Get all active plans for this day
    const qb = this.journeyPlanRepo
      .createQueryBuilder("plan")
      .leftJoinAndSelect("plan.user", "user")
      .leftJoinAndSelect("plan.branch", "branch")
      .leftJoinAndSelect("branch.project", "project")
      .leftJoinAndSelect("plan.shift", "shift")
      .where(":dayName = ANY(plan.days)", { dayName })
      .andWhere("user.deleted_at IS NULL")
      .andWhere("branch.deleted_at IS NULL");

    const plans = await qb.getMany();
    
    let restoredCount = 0;
    let createdCount = 0;
    const errors = [];

    for (const plan of plans) {
       if (!plan.user || !plan.branch || !plan.shift) continue;

       try {
         // 2. Check if journey exists (ACTIVE only)
         const journey = await this.journeyRepo.findOne({
           where: {
             user: { id: plan.user.id },
             shift: { id: plan.shift.id },
             date: targetDate,
             branch: { id: plan.branch.id },
             status: Not(In([
              JourneyStatus.UNPLANNED_ABSENT,
              JourneyStatus.UNPLANNED_PRESENT,
              JourneyStatus.UNPLANNED_CLOSED,
            ])),
           },
           // createJourneysForTomorrow checks for Unplanned status exclusion, let's match that to be safe
           // But here we are looking for PLANNED journeys mainly.
           // Actually, let's keep it simple: if ANY journey exists for this plan/date/shift, we are good.
           // If it's soft-deleted, findOne won't find it (default behavior), so we go to 'else' and create new.
         });

         if (journey) {
           // Journey exists and is active. Do nothing.
         } else {
           // 3. If doesn't exist (or was soft-deleted), create it
           console.log(`🆕 Creating missing journey for user ${plan.user.name} on ${targetDate}`);
           const newJourney = this.journeyRepo.create({
              user: plan.user,
              branch: plan.branch,
              shift: plan.shift,
              projectId: plan.projectId || plan.branch.project?.id,
              date: targetDate,
              type: JourneyType.PLANNED,
              status: JourneyStatus.ABSENT,
              journeyPlan: plan,
           });
           await this.journeyRepo.save(newJourney);
           createdCount++;
         }
       } catch (err) {
         console.error(`❌ Error recovering journey for plan ${plan.id}:`, err);
         errors.push({ planId: plan.id, error: err.message });
       }
    }

    return {
      date: targetDate,
      totalPlans: plans.length,
      restoredCount,
      createdCount,
      errors
    };
  }

  // ===== Auto-close journeys at 3 AM =====
  async autoCloseJourneys() {
    const now = new Date();
    
    // Find all journeys with PRESENT or UNPLANNED_PRESENT status
    const openJourneys = await this.journeyRepo.find({
      where: [
        { status: JourneyStatus.PRESENT },
        { status: 'present' as any },
        { status: JourneyStatus.UNPLANNED_PRESENT },
        { status: 'unplanned-present' as any },
      ],
      relations: ['user', 'branch', 'shift'],
    });

    let closedCount = 0;

    for (const journey of openJourneys) {
      try {
        // Find or create check-in record
        let checkIn = await this.checkInRepo.findOne({
          where: { journey: { id: journey.id } },
        });

        if (checkIn) {
          // Only update if there's no checkout time already
          if (!checkIn.checkOutTime) {
            checkIn.checkOutTime = now;
            await this.checkInRepo.save(checkIn);
          }
        } else {
          // This happens if status is PRESENT but no check-in record was found.
          // Revert status to ABSENT/UNPLANNED_ABSENT to resolve inconsistency.
          console.warn(`Journey ${journey.id} had PRESENT status but no check-in record. Reverting to ABSENT.`);
          journey.status = journey.type === JourneyType.PLANNED 
            ? JourneyStatus.ABSENT 
            : JourneyStatus.UNPLANNED_ABSENT;
          await this.journeyRepo.save(journey);
          continue;
        }

        // Update journey status
        journey.status = journey.type === JourneyType.PLANNED 
          ? JourneyStatus.CLOSED 
          : JourneyStatus.UNPLANNED_CLOSED;
        
        await this.journeyRepo.save(journey);
        closedCount++;
      } catch (error) {
        console.error(`Error auto-closing journey ${journey.id}:`, error);
      }
    }

    return { closedCount, totalFound: openJourneys.length, timestamp: now };
  }


  async getSupervisorBranches(supervisorId: string): Promise<Branch[]> {
    return this.branchRepo.find({
      where: [
        { supervisor: { id: supervisorId } },
        { supervisors: { id: supervisorId } }
      ],
    });
  }
  async getImportTemplate(): Promise<Buffer> {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet([
      {
        Username: 'johndoe',
        Branch: 'Main Branch',
        Shift: 'Morning Shift',
        Days: 'monday,tuesday',
      },
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  async importPlans(file: Express.Multer.File, projectId: string) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    const results = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const [index, row] of data.entries()) {
      try {
        const username = row['Username'] || row['username'] as String;
        const name = row['Name'] || row['name'] as String;
        const branchName = row['Branch'] || row['branch'] as String;
        const shiftName = row['Shift'] || row['shift'] as String;
        const daysString = row['Days'] || row['days'] as String;

        if ((!username && !name) || !branchName || !shiftName || !daysString) {
          throw new Error('Missing required fields');
        }

        // Find User
        const userConditions: any[] = [];
        if (username) userConditions.push({ username: typeof username === 'string' ? username.toLowerCase() : username });
        if (name) userConditions.push({ name: typeof name === 'string' ? name.toLowerCase() : name });
        
        // If neither is present, error is thrown above.
        
        let user: User | null = null;
        if (userConditions.length > 0) {
            user = await this.userRepo.findOne({
                where: userConditions
            });
        }


        if (!user) {
          throw new NotFoundException(`User not found: ${username || name}`);
        }

        // Find Branch
        // Try to find by name first, maybe scoped by project if possible?
        // Ideally we should filter branches by project, but for now global search might be okay if names are unique.
        // Or we can filter in memory or proper query.
        let branch = await this.branchRepo.findOne({
          where: { name: branchName, project: { id: projectId } },
          relations: ['project', 'city', 'city.region']
        });

        if (!branch) {
             throw new NotFoundException(`Branch not found: ${branchName}`);
        }

        // Find Shift
        const shift = await this.shiftRepo.findOne({
          where: { name: shiftName },
        });

        if (!shift) {
          throw new NotFoundException(`Shift not found: ${shiftName}`);
        }

        const days = daysString.split(',').map(d => d.trim().toLowerCase());
        
        // Create DTO
        const dto: CreateJourneyPlanDto = {
            userId: user.id,
            branchId: branch.id,
            shiftId: shift.id,
            days: days
        };

        // Reuse createPlan logic but handle errors
        // We can call createPlan directly.
        await this.createPlan(dto);
        results.success++;

      } catch (error) {
        results.failed++;
        results.errors.push({
          row: index + 2, // 1-based index, +header
          error: error.message,
          data: row
        });
      }
    }

    return results;
  }
  async removeAllPlansByUser(userId: string) {
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    const plans = await this.journeyPlanRepo.find({
      where: { user: { id: userId } },
    });

    if (!plans.length) {
      throw new NotFoundException(`No journey plans found for user: ${userId}`);
    }

    return this.journeyPlanRepo.delete({ user: { id: userId } });
  }
}
