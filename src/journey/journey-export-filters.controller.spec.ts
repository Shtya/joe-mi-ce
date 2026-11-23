import { JourneyController } from "./journey.controller";
import { JourneyService } from "./journey.service";
import { UsersService } from "../users/users.service";
import { CRUD } from "common/crud.service";
import { In } from "typeorm";
import { JourneyStatus } from "entities/all_plans.entity";

describe("Journey export filters", () => {
  const controller = new JourneyController(
    { journeyRepo: {} } as JourneyService,
    {} as UsersService,
  );
  let findAll: jest.SpyInstance;

  beforeEach(() => {
    findAll = jest.spyOn(CRUD, "findAllRelation").mockResolvedValue({
      records: [],
      total_records: 0,
      current_page: 1,
      per_page: 1000,
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ["closed", "closed"],
    [{ id: "closed" }, "closed"],
    ["unplanned-closed", In(["unplanned_closed", "unplanned-closed"])],
  ])(
    "maps overall_status %p to the persisted journey status",
    async (input, expected) => {
      await controller.getJourneys(
        "project-1",
        {
          filters: {
            overall_status: input,
            fromDate: "2026-11-22",
            toDate: "2026-11-22",
            role: { id: "role-1" },
          },
        },
        1,
        1000,
      );

      expect(findAll.mock.calls[0][9]).toEqual({
        projectId: "project-1",
        is_active: true,
        status: expected,
        date_from: "2026-11-22",
        date_to: "2026-11-22",
        user: { role: { id: "role-1" } },
      });
    },
  );

  it("keeps an explicit status filter when the legacy alias is also supplied", async () => {
    await controller.getJourneys("project-1", {
      filters: { status: { id: "present" }, overall_status: "closed" },
    });
    expect(findAll.mock.calls[0][9]).toEqual({
      projectId: "project-1",
      is_active: true,
      status: "present",
    });
  });

  it("keeps the top-level status parameter's precedence", async () => {
    await controller.getJourneys(
      "project-1",
      { filters: { overall_status: "closed" } },
      1,
      1000,
      undefined,
      undefined,
      undefined,
      undefined,
      JourneyStatus.PRESENT,
    );
    expect(findAll.mock.calls[0][9]).toEqual({
      projectId: "project-1",
      is_active: true,
      status: "present",
    });
  });

  it("loads the journey branch country for the export response", async () => {
    await controller.getJourneys("project-1", {});
    expect(findAll.mock.calls[0][7]).toContain("branch.city.region.country");
    expect(findAll.mock.calls[0][9]).toEqual({
      projectId: "project-1",
      is_active: true,
    });
  });

  it("loads geography for journey plan exports", async () => {
    await controller.getPlans({}, "project-1");
    expect(findAll.mock.calls[0][7]).toContain("branch.city.region.country");
  });

  it("includes country in the flat optimized journey plan response", async () => {
    findAll.mockResolvedValueOnce({
      records: [
        {
          days: ["sunday"],
          journeys: [],
          branch: {
            name: "Visit Branch",
            city: {
              name: "Riyadh",
              region: { country: { name: "Saudi Arabia" } },
            },
          },
        },
      ],
      current_page: 1,
      per_page: 1000,
    });
    const result = await controller.getOptimizedPlans(
      {},
      "project-1",
      1,
      1000,
      undefined,
      undefined,
      "2026-11-22",
    );
    expect(findAll.mock.calls[0][7]).toContain("branch.city.region.country");
    expect(result.data[0]).toMatchObject({
      branchName: "Visit Branch",
      city: "Riyadh",
      country: "Saudi Arabia",
    });
  });
});
