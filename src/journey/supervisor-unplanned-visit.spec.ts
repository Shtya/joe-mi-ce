import { ForbiddenException } from "@nestjs/common";
import { Branch } from "../../entities/branch.entity";
import {
  CheckIn,
  Journey,
  JourneyPlan,
  JourneyStatus,
} from "../../entities/all_plans.entity";
import { Project } from "../../entities/project.entity";
import { User } from "../../entities/user.entity";
import { Shift } from "../../entities/employee/shift.entity";
import { VacationDate } from "../../entities/employee/vacation-date.entity";
import { Sale } from "../../entities/products/sale.entity";
import { PromoterLocation } from "../../entities/promoter-location.entity";
import { LocationLog } from "../../entities/location-log.entity";
import { ERole } from "../../enums/Role.enum";
import { AuthService } from "../auth/auth.service";
import { MailService } from "../mail/mail.service";
import { NotificationService } from "../notification/notification.service";
import { JourneyService } from "./journey.service";
import { LocationCacheService } from "./location-cache.service";

describe("JourneyService supervisor unplanned visit", () => {
  const createRepository = () => ({
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    manager: { transaction: jest.fn() },
  });

  const journeyPlanRepo = createRepository();
  const journeyRepo = createRepository();
  const checkInRepo = createRepository();
  const projectRepo = createRepository();
  const userRepo = createRepository();
  const branchRepo = createRepository();
  const shiftRepo = createRepository();
  const vacationDateRepo = createRepository();
  const saleRepo = createRepository();
  const locationRepo = createRepository();
  const locationLogRepo = createRepository();
  const notificationService = {
    notifySupervisorOnCheckin: jest.fn(),
    notifyPromoterOnCheckin: jest.fn(),
  };
  const locationCacheService = {
    deleteLocationContext: jest.fn(),
  };

  const service = new JourneyService(
    journeyPlanRepo as any,
    journeyRepo as any,
    checkInRepo as any,
    projectRepo as any,
    userRepo as any,
    branchRepo as any,
    shiftRepo as any,
    vacationDateRepo as any,
    saleRepo as any,
    locationRepo as any,
    locationLogRepo as any,
    notificationService as unknown as NotificationService,
    {} as AuthService,
    {} as MailService,
    locationCacheService as unknown as LocationCacheService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates an immediately checked-in unplanned journey for the supervisor at the supplied location", async () => {
    const supervisor = {
      id: "supervisor-1",
      project_id: "project-1",
      role: { name: ERole.SUPERVISOR },
    } as User;
    const unplannedBranch = {
      id: "branch-unplanned",
      name: "Unplanned",
      geo: { lat: 30.01, lng: 31.02 },
      geofence_radius_meters: 500,
    } as Branch;
    const journey = { id: "journey-1" } as Journey;
    const checkIn = { id: "check-in-1" } as CheckIn;

    userRepo.findOne.mockResolvedValue(supervisor);
    branchRepo.find.mockResolvedValue([
      { city: { id: "city-1" }, project: { id: "project-1" } },
    ]);
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === Branch) {
          return { findOne: jest.fn().mockResolvedValue(unplannedBranch) };
        }
        if (entity === Journey) {
          return {
            create: jest.fn((value) => Object.assign(journey, value)),
          };
        }
        return {
          create: jest.fn((value) => Object.assign(checkIn, value)),
        };
      }),
      save: jest.fn(async (_entity, value) => value),
    };
    journeyRepo.manager.transaction.mockImplementation(async (callback) =>
      callback(manager),
    );

    const result = await service.checkInSupervisorUnplannedVisit(
      {
        lat: 30.01,
        lng: 31.02,
        checkInTime: "2026-09-10T08:30:00.000Z",
      },
      supervisor,
    );

    expect(result.journey.status).toBe(JourneyStatus.UNPLANNED_PRESENT);
    expect(result.journey.visitGeo).toEqual({ lat: 30.01, lng: 31.02 });
    expect(result.checkIn.checkInTime).toEqual(
      new Date("2026-09-10T08:30:00.000Z"),
    );
    expect(result.checkIn.geo).toBe("30.01,31.02");
    expect(result.journey.branch).toBe(unplannedBranch);
  });

  it("rejects an unplanned visit requested by a non-supervisor", async () => {
    const promoter = {
      id: "promoter-1",
      project_id: "project-1",
      role: { name: ERole.PROMOTER },
    } as User;
    userRepo.findOne.mockResolvedValue(promoter);

    await expect(
      service.checkInSupervisorUnplannedVisit(
        {
          lat: 30.01,
          lng: 31.02,
          checkInTime: "2026-09-10T08:30:00.000Z",
        },
        promoter,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("reuses an existing Unplanned branch without requiring a supervisor branch city", async () => {
    const supervisor = {
      id: "supervisor-1",
      project_id: "project-1",
      role: { name: ERole.SUPERVISOR },
    } as User;
    const unplannedBranch = {
      id: "branch-unplanned",
      name: "Unplanned",
      geo: { lat: 30.01, lng: 31.02 },
      geofence_radius_meters: 500,
    } as Branch;

    userRepo.findOne.mockResolvedValue(supervisor);
    branchRepo.find.mockResolvedValue([]);
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === Branch) {
          return { findOne: jest.fn().mockResolvedValue(unplannedBranch) };
        }
        return { create: jest.fn((value) => value) };
      }),
      save: jest.fn(async (_entity, value) => value),
    };
    journeyRepo.manager.transaction.mockImplementation(async (callback) =>
      callback(manager),
    );

    const result = await service.checkInSupervisorUnplannedVisit(
      {
        lat: 30.01,
        lng: 31.02,
        checkInTime: "2026-09-10T08:30:00.000Z",
      },
      supervisor,
    );

    expect(result.journey.branch).toBe(unplannedBranch);
  });

  it("checks out against the unplanned visit location instead of the shared branch location", async () => {
    const journey = {
      id: "journey-1",
      type: "unplanned",
      status: JourneyStatus.UNPLANNED_PRESENT,
      visitGeo: { lat: 30.01, lng: 31.02 },
      branch: {
        id: "branch-unplanned",
        name: "Unplanned",
        geo: { lat: 0, lng: 0 },
        geofence_radius_meters: 500,
      },
      user: {
        id: "supervisor-1",
        name: "Supervisor",
        role: { name: ERole.SUPERVISOR },
      },
    } as Journey;
    const checkIn = {
      id: "check-in-1",
      checkInTime: new Date("2026-09-10T08:30:00.000Z"),
    } as CheckIn;

    journeyRepo.findOne.mockResolvedValue(journey);
    checkInRepo.findOne.mockResolvedValue(checkIn);
    journeyRepo.manager.transaction.mockImplementation(async (callback) =>
      callback({ save: jest.fn(async (_entity, value) => value) }),
    );

    const result = await service.checkInOut({
      journeyId: "journey-1",
      userId: "supervisor-1",
      geo: "30.01,31.02",
      checkOutTime: "2026-09-10T09:30:00.000Z",
    });

    expect((result as { code: number }).code).toBe(200);
    expect(journey.status).toBe(JourneyStatus.UNPLANNED_CLOSED);
    expect(checkIn.isWithinRadius).toBe(true);
  });
});
