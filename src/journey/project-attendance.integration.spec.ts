import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { JourneyService } from "./journey.service";
import {
  Journey,
  JourneyPlan,
  CheckIn,
  JourneyType,
} from "entities/all_plans.entity";
import { Project } from "entities/project.entity";
import { User } from "entities/user.entity";
import { Branch } from "entities/branch.entity";
import { Shift } from "entities/employee/shift.entity";
import { VacationDate } from "entities/employee/vacation-date.entity";
import { Sale } from "entities/products/sale.entity";
import { PromoterLocation } from "entities/promoter-location.entity";
import { LocationLog } from "entities/location-log.entity";
import { NotificationService } from "src/notification/notification.service";
import { AuthService } from "src/auth/auth.service";
import { MailService } from "src/mail/mail.service";
import { LocationCacheService } from "./location-cache.service";
import { INATURAL_PROJECT_ID } from "./project-attendance";

describe("Project-only attendance in the shift journey", () => {
  const repo = () => ({
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    upsert: jest.fn(),
  });
  const shifts = repo();
  const branches = repo(),
    journeys = repo(),
    checkins = repo(),
    plans = { ...repo(), createQueryBuilder: jest.fn() };
  const manager = {
    save: jest.fn(async (_target: unknown, value: unknown) => value),
    update: jest.fn(),
  };
  const transaction = jest.fn(
    async (fn: (m: typeof manager) => Promise<void>) => fn(manager),
  );
  const planned = {
    id: "planned",
    name: "النخيل",
    geo: { lat: 26, lng: 50 },
    geofence_radius_meters: 100,
    project: { id: INATURAL_PROJECT_ID, is_active: true },
    chain: { name: "النخيل" },
  };
  const actual = {
    ...planned,
    id: "actual",
    name: "الظهران",
    geo: { lat: 26.01, lng: 50 },
  };
  let service: JourneyService;
  let journey: ReturnType<typeof makeJourney>;
  function makeJourney(projectId = INATURAL_PROJECT_ID) {
    return {
      id: "journey",
      projectId,
      allowAttendanceFromAnyProjectLocation: projectId === INATURAL_PROJECT_ID,
      shift: {
        id: "shift",
        project: { id: projectId },
      },
      type: JourneyType.PLANNED,
      branch: {
        ...planned,
        chain: { name: "النخيل" },
        project: { id: projectId, is_active: true },
      },
      user: {
        id: "user",
        name: "Employee",
        project_id: projectId,
        role: { name: "promoter" },
      },
      journeyPlan: { id: "plan", branch: planned },
      is_active: true,
    };
  }
  beforeEach(async () => {
    jest.clearAllMocks();
    journey = makeJourney();
    journeys.findOne.mockResolvedValue(journey);
    checkins.findOne.mockResolvedValue(null);
    branches.find.mockResolvedValue([planned, actual]);
    shifts.findOne.mockResolvedValue({ id: "shift" });
    const generic = repo();
    const module = await Test.createTestingModule({
      providers: [
        JourneyService,
        ...[
          Project,
          User,
          VacationDate,
          Sale,
          PromoterLocation,
          LocationLog,
        ].map((entity) => ({
          provide: getRepositoryToken(entity),
          useValue: generic,
        })),
        { provide: getRepositoryToken(JourneyPlan), useValue: plans },
        { provide: getRepositoryToken(Shift), useValue: shifts },
        {
          provide: getRepositoryToken(Journey),
          useValue: { ...journeys, manager: { transaction } },
        },
        { provide: getRepositoryToken(CheckIn), useValue: checkins },
        { provide: getRepositoryToken(Branch), useValue: branches },
        {
          provide: NotificationService,
          useValue: {
            notifyPromoterOnCheckin: jest.fn(),
            notifySupervisorOnCheckin: jest.fn(),
          },
        },
        { provide: AuthService, useValue: {} },
        { provide: MailService, useValue: {} },
        {
          provide: LocationCacheService,
          useValue: { deleteLocationContext: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(JourneyService);
  });
  const dto = {
    journeyId: "journey",
    userId: "user",
    geo: "26.01,50",
    checkInTime: "2026-11-01T06:00:00Z",
  };

  it("stores the actual branch on the shift journey and keeps the planned branch", async () => {
    await service.checkInOut(dto);
    expect(journey.branch.id).toBe("actual");
    expect(journey.journeyPlan.branch.id).toBe("planned");
    expect(manager.update).toHaveBeenCalledWith(User, "user", {
      branch: expect.objectContaining({ id: "actual" }),
    });
    expect(checkins.create).toHaveBeenCalledWith(
      expect.objectContaining({
        journey,
        user: journey.user,
        isWithinRadius: true,
      }),
    );
  });
  it("records the actual branch when the plan and journey omitted a branch", async () => {
    journeys.findOne.mockResolvedValue({
      ...journey,
      branch: null,
      journeyPlan: { id: "plan", branch: null },
    });
    await service.checkInOut(dto);
    expect(manager.update).toHaveBeenCalledWith(User, "user", {
      branch: expect.objectContaining({ id: "actual" }),
    });
  });
  it("keeps other projects restricted to their existing journey location", async () => {
    journey = makeJourney("other");
    journeys.findOne.mockResolvedValue(journey);
    await expect(service.checkInOut(dto)).rejects.toThrow("too far");
    expect(branches.find).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
  it("validates branch ownership from scoped locations when nested eager loading omits branch.project", async () => {
    journey.branch.project = undefined;
    await service.checkInOut(dto);
    expect(journey.branch.id).toBe("actual");
  });
  it("can restrict an Inatural shift to its planned location", async () => {
    journey.allowAttendanceFromAnyProjectLocation = false;
    await expect(service.checkInOut(dto)).rejects.toThrow("too far");
    expect(transaction).not.toHaveBeenCalled();
  });
  it("cannot enable project-wide attendance through a foreign project's shift", async () => {
    journey.shift.project.id = "other";
    await expect(service.checkInOut(dto)).rejects.toThrow("project");
  });
  it("validates shift ownership with a scoped lookup when nested shift.project is omitted", async () => {
    journey.shift.project = undefined;
    await service.checkInOut(dto);
    expect(shifts.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "shift",
          project: { id: INATURAL_PROJECT_ID, is_active: true },
        },
      }),
    );
  });
  it("rejects an unverified shift if the nested project is omitted", async () => {
    journey.shift.project = undefined;
    shifts.findOne.mockResolvedValue(null);
    await expect(service.checkInOut(dto)).rejects.toThrow("project");
  });
  it("uses the journey's assigned branch snapshot if its plan later changes", async () => {
    journey.allowAttendanceFromAnyProjectLocation = false;
    journey.branch = { ...actual, chain: { name: "Actual" } };
    await expect(service.checkInOut({ ...dto, geo: "26,50" })).rejects.toThrow(
      "too far",
    );
    await service.checkInOut(dto);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  it("allows roaming attendance even when the plan is assigned-only", async () => {
    journey.allowAttendanceFromAnyProjectLocation = false;
    journey.branch.chain.name = "Roaming";
    await service.checkInOut({ ...dto, geo: "0,0" });
    expect(transaction).toHaveBeenCalled();
  });
  it("rejects a foreign project's nearby branch when the flag is enabled", async () => {
    journey = makeJourney("other");
    journey.allowAttendanceFromAnyProjectLocation = true;
    journeys.findOne.mockResolvedValue(journey);
    branches.find.mockResolvedValue([journey.branch, actual]);
    await expect(service.checkInOut(dto)).rejects.toThrow("Nearest branch");
  });
  it("enables any-project-location attendance on a shift in another project", async () => {
    journey = makeJourney("other");
    journey.allowAttendanceFromAnyProjectLocation = true;
    journeys.findOne.mockResolvedValue(journey);
    branches.find.mockResolvedValue([
      journey.branch,
      { ...actual, project: { id: "other", is_active: true } },
    ]);
    await service.checkInOut(dto);
    expect(journey.branch.id).toBe("actual");
    expect(branches.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { project: { id: "other", is_active: true } },
      }),
    );
  });
  it("rejects mismatched user project even if the target branch is nearby", async () => {
    journey.user.project_id = "other";
    await expect(service.checkInOut(dto)).rejects.toThrow("project");
    expect(transaction).not.toHaveBeenCalled();
  });
  it("allows roaming anywhere when project-location mode is enabled", async () => {
    journey.branch.chain.name = "Roaming";
    await service.checkInOut({ ...dto, geo: "0,0" });
    expect(transaction).toHaveBeenCalled();
  });
  it.each([
    "ROAMING",
    "Roaming Jeddah",
    "JEDDAH - ROAMING",
    "Roming Riyadh",
    "Roaming  Al-Hassa",
    "Roaming-Eastern",
  ])(
    "allows check-in and checkout for branch-name variant %s even under a regular chain",
    async (name) => {
      journey.branch.name = name;
      journey.branch.chain.name = "extra";
      journey.allowAttendanceFromAnyProjectLocation = false;
      await service.checkInOut({ ...dto, geo: "0,0" });
      checkins.findOne.mockResolvedValue({
        id: "checkin",
        checkInTime: new Date(),
      });
      await service.checkInOut({
        journeyId: journey.id,
        userId: "user",
        geo: "1,1",
        checkOutTime: new Date().toISOString(),
      });
      expect(transaction).toHaveBeenCalledTimes(2);
    },
  );
  it("does not let roaming bypass the authenticated user's identity", async () => {
    journey.branch.chain.name = "Roaming";
    journey.allowAttendanceFromAnyProjectLocation = false;
    await expect(
      service.checkInOut({ ...dto, geo: "0,0" }, "en", "another-user"),
    ).rejects.toThrow("project");
  });
  it("retains the original check-in branch when checking out at another allowed site", async () => {
    checkins.findOne.mockResolvedValue({
      id: "checkin",
      checkInTime: new Date("2026-11-01T06:00:00Z"),
    });
    await service.checkInOut({
      journeyId: "journey",
      userId: "user",
      geo: "26.01,50",
      checkOutTime: "2026-11-01T13:00:00Z",
    });
    expect(journey.branch.id).toBe("planned");
  });

  it.each(
    (
      [
        "createJourneysForToday",
        "createJourneysForTomorrow",
        "recoverJourneys",
      ] as const
    ).flatMap((method) => [
      { method, projectId: INATURAL_PROJECT_ID, enabled: true },
      { method, projectId: "other", enabled: true },
      { method, projectId: "other", enabled: false },
    ]),
  )(
    "$method avoids duplicates after actual branch changes ($projectId, enabled=$enabled)",
    async ({ method, projectId, enabled }) => {
      journey = makeJourney(projectId);
      const plan = {
        id: "plan",
        projectId,
        user: journey.user,
        branch: planned,
        shift: { id: "shift" },
        allowAttendanceFromAnyProjectLocation: enabled,
        is_active: true,
      };
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([plan]),
      };
      plans.createQueryBuilder.mockReturnValue(qb);
      journeys.findOne.mockImplementation(
        async (options: {
          where: { projectId?: string; journeyPlan?: { id: string } };
        }) =>
          options.where.projectId === projectId ||
          options.where.journeyPlan?.id === plan.id
            ? { ...journey, branch: actual, journeyPlan: plan }
            : null,
      );
      const result = await service[method]();
      expect(result.createdCount).toBe(0);
      expect(journeys.save).not.toHaveBeenCalled();
    },
  );
});
