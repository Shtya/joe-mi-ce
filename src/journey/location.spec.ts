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
import { Logger } from "@nestjs/common";
import { LocationCacheService } from "./location-cache.service";
import { EPermission } from "enums/Permissions.enum";
import { TrackingEvent } from "entities/tracking-event.entity";

describe("Location Tracking System Tests", () => {
  let gateway: LocationGateway;
  let service: JourneyService;

  const mockLocationRepo = {
    upsert: jest.fn(),
    create: jest.fn((val) => val),
    save: jest.fn((val) => Promise.resolve(val)),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
  };

  const mockLocationLogRepo = {
    findAndCount: jest.fn(),
    create: jest.fn((val) => val),
    save: jest.fn((val) => Promise.resolve(val)),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockTrackingEventRepo = { findAndCount: jest.fn() };

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

  const mockJwtService = {
    verifyAsync: jest.fn(),
  };

  const mockLocationCacheService = {
    setLatestLocation: jest.fn(),
    getLatestLocation: jest.fn(),
    getProjectLocations: jest.fn(),
    deleteLatestLocation: jest.fn(),
    getLocationContext: jest.fn(),
    setLocationContext: jest.fn(),
    deleteLocationContext: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocationGateway],
      providers: [
        LocationGateway,
        JourneyService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: MailService, useValue: mockMailService },
        { provide: LocationCacheService, useValue: mockLocationCacheService },
        {
          provide: getRepositoryToken(PromoterLocation),
          useValue: mockLocationRepo,
        },
        {
          provide: getRepositoryToken(LocationLog),
          useValue: mockLocationLogRepo,
        },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        {
          provide: getRepositoryToken(TrackingEvent),
          useValue: mockTrackingEventRepo,
        },
        { provide: getRepositoryToken(CheckIn), useValue: mockCheckInRepo },
        { provide: getRepositoryToken(Journey), useValue: mockJourneyRepo },
        { provide: getRepositoryToken(Project), useValue: mockGeneralRepo },
        { provide: getRepositoryToken(JourneyPlan), useValue: mockGeneralRepo },
        { provide: getRepositoryToken(Branch), useValue: mockGeneralRepo },
        { provide: getRepositoryToken(Shift), useValue: mockGeneralRepo },
        {
          provide: getRepositoryToken(VacationDate),
          useValue: mockGeneralRepo,
        },
        { provide: getRepositoryToken(Sale), useValue: mockGeneralRepo },
        { provide: JwtService, useValue: mockJwtService },
        { provide: Reflector, useValue: {} },
        { provide: "I18nService", useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    gateway = module.get<LocationGateway>(LocationGateway);
    service = module.get<JourneyService>(JourneyService);

    mockLocationRepo.create.mockImplementation((val) => val);
    mockLocationRepo.save.mockImplementation((val) => Promise.resolve(val));
    mockLocationLogRepo.create.mockImplementation((val) => val);
    mockLocationLogRepo.save.mockImplementation((val) => Promise.resolve(val));
    mockLocationRepo.upsert.mockResolvedValue({} as any);
    mockLocationRepo.findOne.mockResolvedValue(null);
    mockLocationCacheService.getProjectLocations.mockResolvedValue([]);
    mockLocationCacheService.getLocationContext.mockResolvedValue(null);
    mockLocationCacheService.setLocationContext.mockResolvedValue(undefined);
    mockLocationCacheService.setLatestLocation.mockResolvedValue(undefined);
    mockLocationCacheService.deleteLatestLocation.mockResolvedValue(undefined);
    mockLocationCacheService.deleteLocationContext.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("upsertPromoterLocation (Service Level)", () => {
    it("should not save a point within 10 meters before 10 minutes pass", async () => {
      const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation();
      mockUserRepo.findOne.mockResolvedValue({
        id: "u1",
        name: "Promoter 1",
        avatar_url: "",
      });
      mockCheckInRepo.findOne.mockResolvedValue({
        id: "c1",
        journey: { id: "j1" },
      });
      mockLocationLogRepo.findOne.mockResolvedValue({
        recordedAt: new Date(Date.now() - 5 * 60_000),
        lat: 24.7136,
        lng: 46.6753,
        isOutside: false,
      });

      await service.upsertPromoterLocation({
        userId: "u1",
        lat: 24.71361,
        lng: 46.6753,
      });

      expect(mockLocationLogRepo.save).not.toHaveBeenCalled();
      expect(mockLocationRepo.upsert).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("reason=within_10m_before_10m"),
      );
    });

    it("should reject a tracking ping when the user has no active check-in", async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: "u1",
        name: "Promoter 1",
        avatar_url: "",
      });
      mockCheckInRepo.findOne.mockResolvedValue(null);

      await expect(
        service.upsertPromoterLocation({
          userId: "u1",
          lat: 24.1234,
          lng: 46.5678,
        }),
      ).rejects.toThrow("Active check-in is required for location tracking");
    });

    it("should save location logs as live when there is no gap > 20 minutes", async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: "u1",
        name: "Promoter 1",
        avatar_url: "",
      });
      mockCheckInRepo.findOne.mockResolvedValue({
        id: "c1",
        journey: { id: "j1" },
      });
      mockJourneyRepo.findOne.mockResolvedValue({
        projectId: "p1",
        branch: null,
      });
      mockLocationLogRepo.findOne.mockResolvedValue({
        recordedAt: new Date(Date.now() - 5 * 60_000), // 5 mins ago
      });

      await service.upsertPromoterLocation({
        userId: "u1",
        lat: 24.1234,
        lng: 46.5678,
      });

      expect(mockLocationRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "u1", offlineSince: null }),
        ["userId"],
      );
    });

    it("should automatically record a missing timestamp in Saudi Arabia time", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-09-28T09:30:00.000Z"));
      mockUserRepo.findOne.mockResolvedValue({
        id: "u1",
        name: "Promoter 1",
        avatar_url: "",
      });
      mockCheckInRepo.findOne.mockResolvedValue({
        id: "c1",
        journey: { id: "j1" },
      });
      mockLocationLogRepo.findOne.mockResolvedValue(null);

      const result = await service.upsertPromoterLocation({
        userId: "u1",
        lat: 24.1234,
        lng: 46.5678,
      });

      expect(result.recordedAt).toBe("2026-09-28T12:30:00.000+03:00");
      expect(mockLocationLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          recordedAt: new Date("2026-09-28T09:30:00.000Z"),
        }),
      );

      jest.useRealTimers();
    });

    it("should automatically trigger offlineSince when gap is > 20 minutes", async () => {
      const lastRecordedTime = new Date(Date.now() - 25 * 60_000); // 25 mins ago
      mockUserRepo.findOne.mockResolvedValue({
        id: "u1",
        name: "Promoter 1",
        avatar_url: "",
      });
      mockCheckInRepo.findOne.mockResolvedValue({
        id: "c1",
        journey: { id: "j1" },
      });
      mockLocationLogRepo.findOne.mockResolvedValue({
        recordedAt: lastRecordedTime,
      });

      await service.upsertPromoterLocation({
        userId: "u1",
        lat: 24.1234,
        lng: 46.5678,
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

    it("should classify locations as inside, outside, and too_far", async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: "u1",
        name: "Promoter 1",
        avatar_url: "",
      });
      mockCheckInRepo.findOne.mockResolvedValue({
        id: "c1",
        journey: { id: "j1" },
      });
      mockLocationLogRepo.findOne.mockResolvedValue(null);
      mockJourneyRepo.findOne.mockResolvedValue({
        projectId: "p1",
        branch: {
          geo: "24.7136,46.6753",
          geofence_radius_meters: 100,
          chain: { name: "Retail" },
        },
      });

      const inside = await service.upsertPromoterLocation({
        userId: "u1",
        lat: 24.7136,
        lng: 46.6753,
      });
      const outside = await service.upsertPromoterLocation({
        userId: "u1",
        lat: 24.7148,
        lng: 46.6753,
      });
      const tooFar = await service.upsertPromoterLocation({
        userId: "u1",
        lat: 24.7165,
        lng: 46.6753,
      });

      expect(inside.locationStatus).toBe("inside");
      expect(outside.locationStatus).toBe("outside");
      expect(tooFar.locationStatus).toBe("too_far");
    });

    it("should append older offline pings without replacing latest location cache", async () => {
      const oldRecordedAt = "2026-06-26T09:00:00.000Z";
      mockUserRepo.findOne.mockResolvedValue({
        id: "u1",
        name: "Promoter 1",
        avatar_url: "",
      });
      mockCheckInRepo.findOne.mockResolvedValue({
        id: "c1",
        journey: { id: "j1" },
      });
      mockLocationLogRepo.findOne.mockResolvedValue({
        userId: "u1",
        recordedAt: new Date("2026-06-26T10:00:00.000Z"),
      });

      const result = await service.upsertPromoterLocation({
        userId: "u1",
        lat: 24.1234,
        lng: 46.5678,
        recordedAt: oldRecordedAt,
        projectId: "p1",
      });

      expect(result.recordedAt).toBe("2026-06-26T12:00:00.000+03:00");
      expect(mockLocationLogRepo.save).toHaveBeenCalled();
      expect(mockLocationRepo.upsert).not.toHaveBeenCalled();
      expect(mockLocationCacheService.setLatestLocation).not.toHaveBeenCalled();
    });

    it("should use cached location context to avoid user and journey lookups", async () => {
      mockLocationCacheService.getLocationContext.mockResolvedValue({
        userId: "u1",
        name: "Promoter 1",
        avatar_url: "",
        projectId: "p1",
        journeyId: "j1",
        checkInId: "c1",
        branchGeo: "24.7136,46.6753",
        branchRadiusMeters: 100,
        branchChainName: "Retail",
      });
      mockLocationLogRepo.findOne.mockResolvedValue(null);

      const result = await service.upsertPromoterLocation({
        userId: "u1",
        lat: 24.7136,
        lng: 46.6753,
      });

      expect(result.projectId).toBe("p1");
      expect(result.locationStatus).toBe("inside");
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
      expect(mockCheckInRepo.findOne).not.toHaveBeenCalled();
      expect(mockJourneyRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe("getLocationLog (Service Level Filters)", () => {
    it.each([
      [
        { fromDate: "2026-10-28" },
        "log.recordedAt >= :start",
        { start: new Date("2026-10-27T21:00:00Z") },
      ],
      [
        { toDate: "2026-10-28" },
        "log.recordedAt <= :end",
        { end: new Date("2026-10-28T20:59:59.999Z") },
      ],
    ])(
      "should support a single project date bound: %j",
      async (dates, condition, bounds) => {
        const qb = {
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getManyAndCount: jest.fn().mockResolvedValue([
            [
              {
                id: "ping-1",
                lat: "24.100000",
                lng: "46.200000",
                recordedAt: new Date("2026-10-28T09:00:00Z"),
                createdAt: new Date("2026-10-28T09:00:00Z"),
                offlineSince: null,
              },
            ],
            1,
          ]),
        };
        mockLocationLogRepo.createQueryBuilder.mockReturnValue(qb);
        const result = await service.getLocationLog({
          projectId: "p1",
          ...(dates as { fromDate?: string; toDate?: string }),
        });
        expect(qb.andWhere).toHaveBeenCalledWith(condition, bounds);
        expect(result.items[0]).toMatchObject({
          lat: 24.1,
          lng: 46.2,
          recordedAt: "2026-10-28T12:00:00.000+03:00",
        });
      },
    );

    it("should serialize history and paginate events within the same Saudi date range", async () => {
      mockLocationLogRepo.findAndCount.mockResolvedValue([
        [
          {
            id: "ping-1",
            lat: "24.123456",
            lng: "46.654321",
            recordedAt: new Date("2026-10-27T21:00:00Z"),
            createdAt: new Date("2026-10-28T09:00:00Z"),
            offlineSince: null,
          },
        ],
        101,
      ]);
      mockTrackingEventRepo.findAndCount.mockResolvedValue([
        [
          {
            id: "event-1",
            lat: null,
            lng: null,
            occurredAt: new Date("2026-10-28T09:00:00Z"),
            created_at: new Date("2026-10-28T09:00:00Z"),
            updated_at: new Date("2026-10-28T09:00:00Z"),
            offlineSince: null,
          },
        ],
        51,
      ]);

      const result = await service.getTrackingHistory({
        userId: "u1",
        page: 2,
        limit: 50,
        fromDate: "2026-10-28",
        toDate: "2026-10-28",
      });

      expect(result.items[0]).toMatchObject({
        lat: 24.123456,
        lng: 46.654321,
        recordedAt: "2026-10-28T00:00:00.000+03:00",
        createdAt: "2026-10-28T12:00:00.000+03:00",
      });
      expect(result.events[0]).toMatchObject({
        lat: null,
        lng: null,
        occurredAt: "2026-10-28T12:00:00.000+03:00",
      });
      expect(result).toMatchObject({ eventsTotal: 51, eventsTotalPages: 2 });
      expect(mockLocationLogRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { recordedAt: "DESC", id: "DESC" },
          skip: 50,
          take: 50,
        }),
      );
      const pingRange =
        mockLocationLogRepo.findAndCount.mock.calls[0][0].where.recordedAt;
      expect(pingRange.value).toEqual([
        new Date("2026-10-27T21:00:00Z"),
        new Date("2026-10-28T20:59:59.999Z"),
      ]);
      const eventQuery = mockTrackingEventRepo.findAndCount.mock.calls[0][0];
      expect(eventQuery).toMatchObject({
        skip: 50,
        take: 50,
        order: { occurredAt: "DESC", id: "DESC" },
      });
      expect(eventQuery.where.occurredAt.value).toEqual(pingRange.value);
    });

    it.each(["2026-02-30", "not-a-date", "2026-10-28T00:00:00Z"])(
      "should reject invalid tracking date %s",
      async (fromDate) => {
        await expect(
          service.getTrackingHistory({ userId: "u1", fromDate }),
        ).rejects.toThrow("Invalid tracking date");
        expect(mockLocationLogRepo.findAndCount).not.toHaveBeenCalled();
      },
    );

    it("should apply query builder conditions correctly", async () => {
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
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

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "log.userId = :userId",
        { userId: "u1" },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "log.projectId = :projectId",
        { projectId: "p1" },
      );
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
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledWith(
        "log.id",
        "DESC",
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "log.recordedAt BETWEEN :start AND :end",
        {
          start: new Date("2026-06-19T21:00:00Z"),
          end: new Date("2026-06-24T20:59:59.999Z"),
        },
      );
    });
  });

  describe("LocationGateway (Controller Endpoints)", () => {
    it("should POST a location ping and automatically resolve user's projectId", async () => {
      const req = { user: { id: "u1" } };
      const payload = { lat: 24.1, lng: 46.2 };
      mockUsersService.resolveProjectIdFromUser.mockResolvedValue("p1");
      jest
        .spyOn(service, "upsertPromoterLocation")
        .mockResolvedValue({ success: true } as any);

      const res = await gateway.createLocation(req, payload);

      expect(mockUsersService.resolveProjectIdFromUser).toHaveBeenCalledWith(
        "u1",
      );
      expect(service.upsertPromoterLocation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u1",
          projectId: "p1",
        }),
      );
      expect(res.success).toBe(true);
    });

    it("should POST an offline location ping with client recordedAt", async () => {
      const req = { user: { id: "u1" } };
      const payload = {
        lat: 24.1,
        lng: 46.2,
        recordedAt: "2026-06-26T09:40:00.000Z",
      };
      mockUsersService.resolveProjectIdFromUser.mockResolvedValue("p1");
      jest.spyOn(service, "upsertPromoterLocation").mockResolvedValue({
        success: true,
        saved: true,
        userId: "u1",
        projectId: "p1",
        journeyId: null,
        checkInId: null,
        lat: 24.1,
        lng: 46.2,
        recordedAt: payload.recordedAt,
        distanceMeters: null,
        locationStatus: "inside",
        isOutside: false,
        message: "User is inside the branch geofence",
      });

      const res = await gateway.createLocation(req, payload);

      expect(service.upsertPromoterLocation).toHaveBeenCalledWith(
        expect.objectContaining({
          recordedAt: payload.recordedAt,
          projectId: "p1",
        }),
      );
      expect(res.success).toBe(true);
    });

    it("should handle authenticated socket location updates", async () => {
      const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation();
      const client: any = {
        data: { user: { id: "u1" } },
        handshake: { auth: { lang: "ar" }, headers: {} },
      };
      const payload = { lat: 24.1, lng: 46.2 };
      const ack = jest.fn();
      mockUsersService.resolveProjectIdFromUser.mockResolvedValue("p1");
      jest
        .spyOn(service, "upsertPromoterLocation")
        .mockResolvedValue({ success: true } as any);

      const res = await (gateway.handleLocationUpdate as any)(
        client,
        payload,
        ack,
      );

      expect(service.upsertPromoterLocation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u1",
          projectId: "p1",
          lat: 24.1,
          lng: 46.2,
          lang: "ar",
        }),
      );
      expect(res).toBeUndefined();
      expect(ack).toHaveBeenCalledWith({
        event: "location:updated",
        data: { success: true },
      });
      expect(logSpy).toHaveBeenCalledWith(
        "Tracking ping received user=u1 source=socket lat=24.1 lng=46.2",
      );
      expect(logSpy).toHaveBeenCalledWith(
        "Tracking ping completed user=u1 source=socket saved=true",
      );
      expect(logSpy).toHaveBeenCalledWith(
        "Tracking ping acknowledged user=u1 source=socket",
      );
    });

    it("should authenticate the socket before accepting location events", async () => {
      const use = jest.fn();
      const namespace = { use };
      const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation();
      const client: any = {
        data: {},
        id: "socket-1",
        handshake: { auth: { token: "valid-token" }, headers: {} },
      };
      const next = jest.fn();
      mockJwtService.verifyAsync.mockResolvedValue({ sub: "u1" });
      mockUserRepo.findOne.mockResolvedValue({ id: "u1", is_active: true });

      (gateway as any).afterInit(namespace);

      expect(use).toHaveBeenCalledTimes(1);
      await use.mock.calls[0][0](client, next);

      expect(client.data.user).toEqual({ id: "u1", is_active: true });
      expect(next).toHaveBeenCalledWith();
      expect(logSpy).toHaveBeenCalledWith(
        "Tracking socket connection attempt socket=socket-1",
      );
      expect(logSpy).toHaveBeenCalledWith(
        "Tracking socket authenticated user=u1 socket=socket-1",
      );
    });

    it("should log the Socket.IO disconnect reason", () => {
      const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation();
      const on = jest.fn();
      const client: any = {
        data: { user: { id: "u1" } },
        id: "socket-1",
        on,
      };

      gateway.handleConnection(client);

      expect(on).toHaveBeenCalledWith("disconnect", expect.any(Function));
      const disconnectListener = on.mock.calls.find(
        ([event]) => event === "disconnect",
      )?.[1];
      disconnectListener("transport close");
      expect(logSpy).toHaveBeenCalledWith(
        "Tracking socket disconnected user=u1 socket=socket-1 reason=transport close",
      );
    });

    it("should acknowledge location updates through the native Socket.IO listener", async () => {
      const on = jest.fn();
      const client: any = {
        data: { user: { id: "u1" } },
        id: "socket-1",
        handshake: { auth: { lang: "en" }, headers: {} },
        on,
      };
      const ack = jest.fn();
      mockUsersService.resolveProjectIdFromUser.mockResolvedValue("p1");
      jest
        .spyOn(service, "upsertPromoterLocation")
        .mockResolvedValue({ success: true } as any);

      gateway.handleConnection(client);

      const locationUpdateListener = on.mock.calls.find(
        ([event]) => event === "location:update",
      )?.[1];
      await locationUpdateListener({ lat: 24.1, lng: 46.2 }, ack);

      expect(ack).toHaveBeenCalledWith({
        event: "location:updated",
        data: { success: true },
      });
    });

    it("should return a user's paginated tracking history through Socket.IO", async () => {
      const on = jest.fn();
      const client: any = {
        data: { user: { id: "u1", hasPermission: jest.fn() } },
        id: "socket-1",
        handshake: { auth: {}, headers: {} },
        on,
      };
      const ack = jest.fn();
      const history = {
        items: [{ id: "ping-1" }],
        total: 1,
        page: 2,
        limit: 25,
        totalPages: 1,
      };
      jest
        .spyOn(service, "getTrackingHistory")
        .mockResolvedValue(history as any);

      gateway.handleConnection(client);

      const trackingListener = on.mock.calls.find(
        ([event]) => event === "tracking:user:get",
      )?.[1];
      await trackingListener({ page: 2, limit: 25 }, ack);

      expect(service.getTrackingHistory).toHaveBeenCalledWith({
        userId: "u1",
        page: 2,
        limit: 25,
        fromDate: undefined,
        toDate: undefined,
      });
      expect(ack).toHaveBeenCalledWith({
        event: "tracking:user:result",
        data: { success: true, ...history },
      });
    });

    it("should return project tracking only with the project tracking permission", async () => {
      const hasPermission = jest.fn().mockResolvedValue(true);
      const on = jest.fn();
      const client: any = {
        data: { user: { id: "u1", hasPermission } },
        id: "socket-1",
        handshake: { auth: {}, headers: {} },
        on,
      };
      const ack = jest.fn();
      const history = {
        items: [{ id: "ping-1" }],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      };
      mockUsersService.resolveProjectIdFromUser.mockResolvedValue("p1");
      jest.spyOn(service, "getLocationLog").mockResolvedValue(history as any);

      gateway.handleConnection(client);

      const trackingListener = on.mock.calls.find(
        ([event]) => event === "tracking:project:get",
      )?.[1];
      await trackingListener({ page: 1, limit: 50 }, ack);

      expect(hasPermission).toHaveBeenCalledWith(
        EPermission.LOCATION_TRACKING_READ_PROJECT,
      );
      expect(service.getLocationLog).toHaveBeenCalledWith({
        projectId: "p1",
        page: 1,
        limit: 50,
        fromDate: undefined,
        toDate: undefined,
      });
      expect(ack).toHaveBeenCalledWith({
        event: "tracking:project:result",
        data: { success: true, ...history },
      });
    });

    it("should reject another user's tracking without the user tracking permission", async () => {
      const on = jest.fn();
      const client: any = {
        data: {
          user: { id: "u1", hasPermission: jest.fn().mockResolvedValue(false) },
        },
        id: "socket-1",
        handshake: { auth: {}, headers: {} },
        on,
      };
      const ack = jest.fn();
      const getTrackingHistorySpy = jest.spyOn(service, "getTrackingHistory");

      gateway.handleConnection(client);

      const trackingListener = on.mock.calls.find(
        ([event]) => event === "tracking:user:get",
      )?.[1];
      await trackingListener({ userId: "u2" }, ack);

      expect(getTrackingHistorySpy).not.toHaveBeenCalled();
      expect(ack).toHaveBeenCalledWith({
        event: "tracking:user:result",
        data: {
          success: false,
          message: "You cannot view another user's tracking history",
        },
      });
    });

    it("should define separate permissions for user and project tracking", () => {
      expect((EPermission as any).LOCATION_TRACKING_READ_USER).toBe(
        "LOCATION_TRACKING_READ_USER",
      );
      expect((EPermission as any).LOCATION_TRACKING_READ_PROJECT).toBe(
        "LOCATION_TRACKING_READ_PROJECT",
      );
    });

    it.each([
      { page: -1 },
      { page: 1.5 },
      { page: true },
      { limit: "NaN" },
      { fromDate: "2026-02-30" },
      { fromDate: 123 },
      { fromDate: "2026-10-29", toDate: "2026-10-28" },
    ])(
      "should reject malformed socket tracking queries: %j",
      async (payload) => {
        const on = jest.fn();
        const client: any = { id: "s1", data: { user: { id: "u1" } }, on };
        const ack = jest.fn();
        const history = jest
          .spyOn(service, "getTrackingHistory")
          .mockResolvedValue({ items: [] } as any);
        gateway.handleConnection(client);
        await on.mock.calls.find(([event]) => event === "tracking:user:get")[1](
          payload,
          ack,
        );
        expect(ack.mock.calls[0][0].data.success).toBe(false);
        expect(history).not.toHaveBeenCalled();
      },
    );

    it("should hide internal database errors in socket acknowledgements", async () => {
      jest.spyOn(Logger.prototype, "error").mockImplementation();
      const on = jest.fn();
      const client: any = { id: "s1", data: { user: { id: "u1" } }, on };
      const ack = jest.fn();
      jest
        .spyOn(service, "getTrackingHistory")
        .mockRejectedValue(new Error("SQL password=secret"));
      gateway.handleConnection(client);
      await on.mock.calls.find(([event]) => event === "tracking:user:get")[1](
        {},
        ack,
      );
      expect(ack).toHaveBeenCalledWith({
        event: "tracking:user:result",
        data: {
          success: false,
          message: "Unable to retrieve tracking",
        },
      });
    });

    it("should deny cross-project user history even with permission", async () => {
      const on = jest.fn();
      const client: any = {
        id: "s1",
        data: {
          user: { id: "u1", hasPermission: jest.fn().mockResolvedValue(true) },
        },
        on,
      };
      const ack = jest.fn();
      const history = jest.spyOn(service, "getTrackingHistory");
      mockUsersService.resolveProjectIdFromUser
        .mockResolvedValueOnce("p1")
        .mockResolvedValueOnce("p2");
      gateway.handleConnection(client);
      await on.mock.calls.find(([event]) => event === "tracking:user:get")[1](
        { userId: "u2" },
        ack,
      );
      expect(ack.mock.calls[0][0].data.success).toBe(false);
      expect(history).not.toHaveBeenCalled();
    });

    it("should reject an unauthenticated socket before location events", async () => {
      const use = jest.fn();
      const namespace = { use };
      const client: any = {
        data: {},
        handshake: { auth: {}, headers: {} },
      };
      const next = jest.fn();

      (gateway as any).afterInit(namespace);

      await use.mock.calls[0][0](client, next);

      expect(client.data.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe("Unauthorized");
    });

    it("should GET latest project locations through active location cache path", async () => {
      const req = { user: { id: "u1" } };
      const cachedItem = {
        userId: "u1",
        projectId: "p1",
        lat: 24.1,
        lng: 46.2,
        recordedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockUsersService.resolveProjectIdFromUser.mockResolvedValue("p1");
      jest
        .spyOn(service, "getActivePromoterLocations")
        .mockResolvedValue([cachedItem as any]);

      const res = await gateway.getLocations(
        req,
        undefined,
        undefined,
        undefined,
        undefined,
        "1",
        "50",
        "30",
      );

      expect(service.getActivePromoterLocations).toHaveBeenCalledWith("p1", 30);
      expect(res.items).toEqual([cachedItem]);
      expect(res.total).toBe(1);
    });

    it("should GET paginated logs filtered by resolved requesting user's project ID", async () => {
      const req = { user: { id: "u1" } };
      mockUsersService.resolveProjectIdFromUser.mockResolvedValue("p1");
      jest.spyOn(service, "getLocationLog").mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 50,
        totalPages: 0,
      });

      const res = await gateway.getLocations(
        req,
        "2026-06-20",
        "2026-06-24",
        "10:00",
        "18:00",
        "1",
        "50",
      );

      expect(mockUsersService.resolveProjectIdFromUser).toHaveBeenCalledWith(
        "u1",
      );
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
