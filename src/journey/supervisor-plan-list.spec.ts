import { CRUD } from "common/crud.service";
import {
  JourneyPlan,
  JourneyStatus,
  JourneyType,
} from "entities/all_plans.entity";
import { ERole } from "enums/Role.enum";
import { JourneyController } from "./journey.controller";
import { JourneyService } from "./journey.service";
import { UsersService } from "../users/users.service";
import { Test } from "@nestjs/testing";

describe("Supervisor plan list after deletion", () => {
  const promoter = {
    id: "promoter",
    name: "Ahmed Hasan",
    is_active: true,
    branch: { id: "branch", name: "Saco Dhran" },
  };
  let plans: JourneyPlan[];
  let journeys: object[];
  let controller: JourneyController;

  beforeEach(async () => {
    plans = [];
    journeys = [];
    jest.spyOn(CRUD, "findAllRelation").mockImplementation(async () => ({
      records: plans,
      total_records: plans.length,
      current_page: 1,
      per_page: 100000,
    }));
    // Repository boundaries are mocked; the controller's transformation and
    // pagination run unchanged, including its legacy assigned-promoter fallback.
    const service = {
      getSupervisorBranches: jest.fn().mockResolvedValue([promoter.branch]),
      userRepo: { find: jest.fn().mockResolvedValue([promoter]) },
      journeyPlanRepo: {},
      journeyRepo: { find: jest.fn().mockImplementation(async () => journeys) },
    };
    const users = {
      resolveUserWithProject: jest.fn().mockResolvedValue({
        id: "supervisor",
        role: { name: ERole.SUPERVISOR },
      }),
      resolveProjectIdFromUser: jest.fn().mockResolvedValue("project"),
    };
    const module = await Test.createTestingModule({
      providers: [
        {
          provide: JourneyController,
          useFactory: (
            journeyService: JourneyService,
            usersService: UsersService,
          ) => new JourneyController(journeyService, usersService),
          inject: [JourneyService, UsersService],
        },
        { provide: JourneyService, useValue: service },
        { provide: UsersService, useValue: users },
      ],
    }).compile();
    controller = module.get(JourneyController);
  });

  afterEach(() => jest.restoreAllMocks());

  const list = () =>
    controller.getAllPlansWithPagination(
      {},
      { user: { id: "supervisor" } },
      1,
      10,
      undefined,
      undefined,
      undefined,
      "2026-11-08",
      "2026-11-08",
    );

  it("does not synthesize a visit for an assigned promoter without an active plan or journey", async () => {
    expect(await list()).toMatchObject({ data: [], total: 0, branchCount: 0 });
  });

  it("keeps an active plan even before a daily journey has been generated", async () => {
    plans = [
      Object.assign(new JourneyPlan(), {
        id: "plan",
        projectId: "project",
        user: promoter,
        branch: promoter.branch,
        days: ["sunday"],
        journeys: [],
      }),
    ];
    expect(await list()).toMatchObject({
      total: 1,
      data: [{ planId: "plan", promoterId: "promoter", days: ["sunday"] }],
    });
  });

  it("keeps a real unplanned visit for a promoter without an active plan", async () => {
    journeys = [
      {
        id: "visit",
        type: JourneyType.UNPLANNED,
        status: JourneyStatus.UNPLANNED_ABSENT,
        is_active: true,
        user: promoter,
        branch: promoter.branch,
        date: "2026-11-08",
        projectId: "project",
      },
    ];
    expect(await list()).toMatchObject({
      total: 1,
      data: [{ journeyId: "visit", promoterId: "promoter" }],
    });
  });
});
