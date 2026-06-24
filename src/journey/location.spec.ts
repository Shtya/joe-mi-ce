import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { LocationGateway } from "./location.gateway";
import { JourneyService } from "./journey.service";
import { UsersService } from "src/users/users.service";
import { PromoterLocation } from "entities/promoter-location.entity";
import { LocationLog } from "entities/location-log.entity";
import { Journey, CheckIn, JourneyPlan } from "entities/all_plans.entity";
import { User } from "entities/user.entity";
import { Branch } from "entities/branch.entity";
import { Project } from "entities/project.entity";
import { Shift } from "entities/employee/shift.entity";
import { VacationDate } from "entities/employee/vacation-date.entity";
import { Sale } from "entities/products/sale.entity";
import { NotificationService } from "../notification/notification.service";
import { AuthService } from "src/auth/auth.service";
import { MailService } from "src/mail/mail.service";
import { AuthGuard } from "src/auth/auth.guard";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";

describe("Location Tracking System Tests", () => {
  let gateway: LocationGateway;
  let service: JourneyService;

  const mockLocationRepo = {
    upsert: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockLocationLogRepo = {
    create: jest.fn((val) => val),
    save: jest.fn((val) => Promise.resolve(val)),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
  };

  const mockCheckInRepo = {
    findOne: jest.fn(),
  };

  const mockJourneyRepo = {
    findOne: jest.fn(),
  };

  const mockUsersService = {
    resolveProjectIdFromUser: jest.fn(),
  };

  const mockGeneralRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockNotificationService = {
    notifySupervisorOnCheckin: jest.fn(),
    notifyPromoterOnCheckin: jest.fn(),
  };

  const mockAuthService = {
    validateToken: jest.fn(),
  };

  const mockMailService = {
    sendMail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocationGateway],
      providers: [
        JourneyService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: MailService, useValue: mockMailService },
        { provide: getRepositoryToken(PromoterLocation), useValue: mockLocationRepo },
        { provide: getRepositoryToken(LocationLog), useValue: mockLocationLogRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(CheckIn), useValue: mockCheckInRepo },
        { provide: getRepositoryToken(Journey), useValue: mockJourneyRepo },
        { provide: getRepositoryToken(Project), useValue: mockGeneralRepo },
        { provide: getRepositoryToken(JourneyPlan), useValue: mockGeneralRepo },
        { provide: getRepositoryToken(Branch), useValue: mockGeneralRepo },
        { provide: getRepositoryToken(Shift), useValue: mockGeneralRepo },
        { provide: getRepositoryToken(VacationDate), useValue: mockGeneralRepo },
        { provide: getRepositoryToken(Sale), useValue: mockGeneralRepo },
        { provide: JwtService, useValue: {} },
        { provide: Reflector, useValue: {} },
        { provide: "I18nService", useValue: {} },
      ],
    })
    .overrideGuard(AuthGuard)
    .useValue({ canActivate: () => true })
    .compile();

    gateway = module.get<LocationGateway>(LocationGateway);
    service = module.get<JourneyService>(JourneyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("upsertPromoterLocation (Service Level)", () => {
    it("should save location logs as live when there is no gap > 20 minutes", async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: "u1", name: "Promoter 1", avatar_url: "" });
      mockCheckInRepo.findOne.mockResolvedValue({ id: "c1", journey: { id: "j1" } });
      mockJourneyRepo.findOne.mockResolvedValue({ projectId: "p1", branch: null });
      mockLocationLogRepo.findOne.mockResolvedValue({
        recordedAt: new Date(Date.now() - 5 * 60_000), // 5 mins ago
      });

      await service.upsertPromoterLocation({
        userId: "u1",
        lat: 24.1234,
        lng: 46.5678,
        offlineSince: null,
      });

      expect(mockLocationRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u1",
          offlineSince: null, // should remain null
        }),
        ["userId"],
      );
    });

    it("should automatically trigger offlineSince when gap is > 20 minutes", async () => {
      const lastRecordedTime = new Date(Date.now() - 25 * 60_000); // 25 mins ago
      mockUserRepo.findOne.mockResolvedValue({ id: "u1", name: "Promoter 1", avatar_url: "" });
      mockCheckInRepo.findOne.mockResolvedValue({ id: "c1", journey: { id: "j1" } });
      mockLocationLogRepo.findOne.mockResolvedValue({
        recordedAt: lastRecordedTime,
      });

      await service.upsertPromoterLocation({
        userId: "u1",
        lat: 24.1234,
        lng: 46.5678,
        offlineSince: null,
      });

      // offlineSince should be automatically set to the last recorded log's time
      expect(mockLocationRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u1",
          offlineSince: lastRecordedTime,
        }),
        ["userId"],
      );

      expect(mockLocationLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          offlineSince: lastRecordedTime,
        }),
      );
    });
  });

  describe("getLocationLog (Service Level Filters)", () => {
    it("should apply query builder conditions correctly", async () => {
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockLocationLogRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.getLocationLog({
        userId: "u1",
        projectId: "p1",
        fromDate: "2026-06-20",
        toDate: "2026-06-24",
        fromTime: "10:00",
        toTime: "18:00",
        page: 2,
        limit: 10,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith("log.userId = :userId", { userId: "u1" });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith("log.projectId = :projectId", { projectId: "p1" });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "log.recordedAt BETWEEN :start AND :end",
        expect.any(Object),
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "CAST(log.recordedAt AS time) BETWEEN :fromTime::time AND :toTime::time",
        { fromTime: "10:00", toTime: "18:00" },
      );
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10); // page 2 with limit 10 skips 10
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });
  });

  describe("LocationGateway (Controller Endpoints)", () => {
    it("should POST a location ping and automatically resolve user's projectId", async () => {
      const req = { user: { id: "u1" } };
      const payload = { lat: 24.1, lng: 46.2 };
      mockUsersService.resolveProjectIdFromUser.mockResolvedValue("p1");
      jest.spyOn(service, "upsertPromoterLocation").mockResolvedValue({} as any);

      const res = await gateway.createLocation(req, payload);

      expect(mockUsersService.resolveProjectIdFromUser).toHaveBeenCalledWith("u1");
      expect(service.upsertPromoterLocation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u1",
          projectId: "p1",
        }),
      );
      expect(res.success).toBe(true);
    });

    it("should GET paginated logs filtered by resolved requesting user's project ID", async () => {
      const req = { user: { id: "u1" } };
      mockUsersService.resolveProjectIdFromUser.mockResolvedValue("p1");
      jest.spyOn(service, "getLocationLog").mockResolvedValue({ items: [], total: 0, page: 1, limit: 50, totalPages: 0 });

      const res = await gateway.getLocations(req, "2026-06-20", "2026-06-24", "10:00", "18:00", "1", "50");

      expect(mockUsersService.resolveProjectIdFromUser).toHaveBeenCalledWith("u1");
      expect(service.getLocationLog).toHaveBeenCalledWith({
        projectId: "p1",
        fromDate: "2026-06-20",
        toDate: "2026-06-24",
        fromTime: "10:00",
        toTime: "18:00",
        page: 1,
        limit: 50,
      });
      expect(res.success).toBe(true);
    });
  });
});
