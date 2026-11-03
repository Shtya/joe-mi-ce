import { JourneyService } from "./journey.service";
import { CreateJourneyPlanDto, UpdateJourneyPlanDto } from "dto/journey.dto";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

const projectId = "7ea269b3-058f-4475-a162-989823e78205";
describe("Attendance policy belongs to journey plans", () => {
  const repo = () => ({
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ ...v, id: v.id || "saved" })),
    update: jest.fn(),
    delete: jest.fn(),
  });
  let plans: ReturnType<typeof repo>,
    journeys: ReturnType<typeof repo>,
    users: ReturnType<typeof repo>,
    branches: ReturnType<typeof repo>,
    shifts: ReturnType<typeof repo>,
    vacations: ReturnType<typeof repo>,
    service: JourneyService;
  const user = { id: "user", project_id: projectId, is_active: true };
  const shift = { id: "shift", project: { id: projectId } };
  const branch = { id: "branch", project: { id: projectId } };
  const dto = {
    userId: "user",
    shiftId: ["shift"],
    days: ["monday"],
    allowAttendanceFromAnyProjectLocation: true,
  };
  beforeEach(() => {
    plans = repo();
    journeys = repo();
    users = repo();
    branches = repo();
    shifts = repo();
    vacations = repo();
    users.findOne.mockResolvedValue(user);
    shifts.find.mockResolvedValue([shift]);
    branches.findOne.mockResolvedValue(branch);
    Object.assign(plans, {
      manager: {
        transaction: jest.fn(async (fn) =>
          fn({
            save: async (_entity, v) => plans.save(v),
            update: async (_entity, where, values) =>
              journeys.update(where, values),
          }),
        ),
      },
    });
    service = new JourneyService(
      plans as never,
      journeys as never,
      {} as never,
      {} as never,
      users as never,
      branches as never,
      shifts as never,
      vacations as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });
  it("accepts a branchless plan when any-project attendance is true", async () => {
    const rows = await service.createPlan(dto as never);
    expect(rows[0]).toMatchObject({
      projectId,
      branch: null,
      allowAttendanceFromAnyProjectLocation: true,
    });
    expect(branches.findOne).not.toHaveBeenCalled();
  });
  it("also accepts an optional branch when true", async () => {
    const rows = await service.createPlan({
      ...dto,
      branchId: "branch",
    } as never);
    expect(rows[0].branch).toEqual(branch);
  });
  it("requires a branch when false", async () => {
    await expect(
      service.createPlan({
        ...dto,
        allowAttendanceFromAnyProjectLocation: false,
      } as never),
    ).rejects.toThrow("Branch");
  });
  it("rejects a branch in another project", async () => {
    branches.findOne.mockResolvedValue({
      ...branch,
      project: { id: "foreign" },
    });
    await expect(
      service.createPlan({ ...dto, branchId: "branch" } as never),
    ).rejects.toThrow("project");
  });
  it("rejects a shift in another project", async () => {
    shifts.find.mockResolvedValue([{ ...shift, project: { id: "foreign" } }]);
    await expect(service.createPlan(dto as never)).rejects.toThrow("project");
  });
  it("updates upcoming journeys automatically after editing the plan", async () => {
    plans.findOne.mockResolvedValue({
      id: "plan",
      user,
      shift,
      branch,
      days: ["monday"],
      projectId,
      allowAttendanceFromAnyProjectLocation: false,
    });
    const saved = await service.updatePlan("plan", {
      allowAttendanceFromAnyProjectLocation: true,
    } as never);
    expect(saved).toMatchObject({
      allowAttendanceFromAnyProjectLocation: true,
    });
    expect(journeys.update).toHaveBeenCalledWith(
      expect.objectContaining({ journeyPlan: { id: "plan" } }),
      expect.objectContaining({ allowAttendanceFromAnyProjectLocation: true }),
    );
  });
  it("updates plans when nested shift.project is omitted by the ORM", async () => {
    plans.findOne.mockResolvedValue({
      id: "plan",
      user,
      shift: { id: shift.id },
      branch,
      days: ["monday"],
      projectId,
      allowAttendanceFromAnyProjectLocation: true,
    });
    shifts.findOne.mockResolvedValue(shift);
    await service.updatePlan("plan", {
      allowAttendanceFromAnyProjectLocation: true,
    } as never);
    expect(shifts.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: shift.id, project: { id: projectId, is_active: true } },
      }),
    );
  });
  it("preserves started journeys when includeToday is requested", async () => {
    plans.findOne.mockResolvedValue({
      id: "plan",
      user,
      shift,
      branch,
      days: ["monday"],
      projectId,
      allowAttendanceFromAnyProjectLocation: false,
    });
    journeys.find.mockResolvedValue([
      { id: "historical", checkin: { id: "saved-checkin" } },
    ]);
    jest
      .spyOn(service, "createJourneysForToday")
      .mockResolvedValue({ createdCount: 0, date: "2026-11-03" });
    await service.updatePlan("plan", {
      allowAttendanceFromAnyProjectLocation: true,
      includeToday: true,
    } as never);
    expect(journeys.find).not.toHaveBeenCalled();
  });
  it("does not disable any-project attendance on a branchless plan without a replacement branch", async () => {
    plans.findOne.mockResolvedValue({
      id: "plan",
      user,
      shift,
      branch: null,
      days: ["monday"],
      projectId,
      allowAttendanceFromAnyProjectLocation: true,
    });
    await expect(
      service.updatePlan("plan", {
        allowAttendanceFromAnyProjectLocation: false,
      } as never),
    ).rejects.toThrow("Branch");
  });
  it.each([
    "createJourneysForToday",
    "createJourneysForTomorrow",
    "recoverJourneys",
  ] as const)(
    "%s copies the flag and keeps branchless plans",
    async (method) => {
      const plan = {
        id: "plan",
        user,
        shift,
        branch: null,
        projectId,
        days: ["monday"],
        allowAttendanceFromAnyProjectLocation: true,
        is_active: true,
      };
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([plan]),
      };
      Object.assign(plans, { createQueryBuilder: jest.fn(() => qb) });
      const result = await service[method]();
      expect(result.createdCount).toBe(1);
      expect(journeys.save).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: null,
          allowAttendanceFromAnyProjectLocation: true,
        }),
      );
      expect(plans.delete).not.toHaveBeenCalled();
    },
  );
  it("returns the field in plan, journey and mobile GET results", async () => {
    const plan = { id: "plan", allowAttendanceFromAnyProjectLocation: true };
    const journey = {
      id: "journey",
      allowAttendanceFromAnyProjectLocation: true,
    };
    plans.findOne.mockResolvedValue(plan);
    journeys.findOne.mockResolvedValue(journey);
    journeys.find.mockResolvedValue([journey]);
    expect(await service.getPlanById("plan")).toMatchObject(plan);
    expect(await service.getJourneyById("journey")).toMatchObject(journey);
    expect(await service.getTodayJourneysForUserMobile("user")).toEqual([
      expect.objectContaining({ allowAttendanceFromAnyProjectLocation: true }),
    ]);
  });
  it("validates a branchless create body and rejects non-booleans on update", async () => {
    const valid = plainToInstance(CreateJourneyPlanDto, {
      userId: projectId,
      shiftId: [projectId],
      days: ["monday"],
      allowAttendanceFromAnyProjectLocation: true,
    });
    expect(await validate(valid)).toEqual([]);
    const invalid = plainToInstance(
      UpdateJourneyPlanDto,
      { allowAttendanceFromAnyProjectLocation: "false" },
      { enableImplicitConversion: true },
    );
    expect(
      (await validate(invalid)).some(
        (e) => e.property === "allowAttendanceFromAnyProjectLocation",
      ),
    ).toBe(true);
  });
});
