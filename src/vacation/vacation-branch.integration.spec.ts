import "reflect-metadata";
import { DataSource } from "typeorm";
import { NotFoundException } from "@nestjs/common";
import { User } from "entities/user.entity";
import { Project } from "entities/project.entity";
import { Branch } from "entities/branch.entity";
import { Journey, CheckIn } from "entities/all_plans.entity";
import { Vacation } from "entities/employee/vacation.entity";
import { VacationDate } from "entities/employee/vacation-date.entity";
import { VacationBalanceService } from "./vacation-balance.service";
import { VacationService } from "./vacation.service";

// Opt-in, disposable local database only; never uses application credentials.
const integration =
  process.env.VACATION_BRANCH_TEST_POSTGRES === "1" ? describe : describe.skip;

integration("vacation branch from actual check-in", () => {
  let source: DataSource;
  let service: VacationService;
  let employee: User;
  let assigned: Branch;
  let actual: Branch;
  let other: Branch;
  let foreign: Branch;
  let project: Project;

  beforeAll(async () => {
    source = new DataSource({
      type: "postgres",
      host: "/tmp/vacation-branch-pg",
      port: 55447,
      username: "mostafa",
      database: "vacation_branch_test",
      entities: [`${process.cwd()}/entities/**/*.entity.ts`],
      synchronize: true,
      dropSchema: true,
    });
    await source.initialize();
    service = new VacationService(
      source.getRepository(Vacation),
      source.getRepository(VacationDate),
      source.getRepository(User),
      source.getRepository(Branch),
      source.getRepository(Journey),
      new VacationBalanceService(source),
    );
    project = await source.getRepository(Project).save({ name: "branch-test" });
    const foreignProject = await source
      .getRepository(Project)
      .save({ name: "other-project" });
    [assigned, actual, other, foreign] = await source
      .getRepository(Branch)
      .save([
        { name: "Stale assigned branch", project },
        { name: "Latest actual branch", project },
        { name: "Other scheduled branch", project },
        { name: "Foreign project branch", project: foreignProject },
      ]);
  }, 30000);

  beforeEach(async () => {
    employee = await source.getRepository(User).save({
      username: `employee-${Date.now()}-${Math.random()}`,
      password: "unused",
      project_id: project.id,
      branch: assigned,
    });
  });

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  async function journey(
    branch: Branch,
    date: string,
    checkInTime?: string,
    checkOutTime?: string,
  ) {
    const saved = await source.getRepository(Journey).save({
      user: employee,
      branch,
      date,
      projectId: project.id,
    });
    if (checkInTime || checkOutTime) {
      await source.getRepository(CheckIn).save({
        user: employee,
        journey: saved,
        checkInTime: checkInTime ? new Date(checkInTime) : null,
        checkOutTime: checkOutTime ? new Date(checkOutTime) : null,
      });
    }
    return saved;
  }

  function request(branchId?: string, dates = ["2026-11-16"]) {
    return service.createVacation(
      {
        userId: employee.id,
        dates,
        reason: "weekend_vacation",
        branchId,
      },
      null,
      "en",
      employee,
    );
  }

  it.each([false, true])(
    "saves the latest actual branch over the profile (stale payload: %s)",
    async (stalePayload) => {
      await journey(other, "2026-11-14", "2026-11-14T18:00:00+03:00");
      await journey(actual, "2026-11-15", "2026-11-15T18:00:00+03:00");
      await journey(other, "2026-11-16");
      const result = await request(stalePayload ? assigned.id : undefined);
      expect(result.branchId).toBe(actual.id);
      const saved = await source.getRepository(Vacation).findOne({
        where: { id: result.id },
        relations: ["branch"],
      });
      expect(saved.branch.id).toBe(actual.id);
    },
  );

  it("orders by check-in timestamp rather than journey date", async () => {
    await journey(other, "2026-11-15", "2026-11-15T08:00:00+03:00");
    await journey(actual, "2026-11-14", "2026-11-15T20:00:00+03:00");
    expect((await request()).branchId).toBe(actual.id);
  });

  it("uses the earliest leave date and excludes its Riyadh midnight boundary", async () => {
    await journey(actual, "2026-11-14", "2026-11-14T23:59:59+03:00");
    await journey(other, "2026-11-15", "2026-11-15T00:00:00+03:00");
    await journey(other, "2026-11-17", "2026-11-17T18:00:00+03:00");
    expect(
      (await request(undefined, ["2026-11-18", "2026-11-15"])).branchId,
    ).toBe(actual.id);
  });

  it("ignores checkout-only, deleted and foreign-project check-ins", async () => {
    await journey(actual, "2026-11-12", "2026-11-12T18:00:00+03:00");
    await journey(other, "2026-11-13", undefined, "2026-11-13T22:00:00+03:00");
    const deleted = await journey(
      other,
      "2026-11-14",
      "2026-11-14T18:00:00+03:00",
    );
    await source
      .getRepository(CheckIn)
      .softDelete({ journey: { id: deleted.id } });
    await journey(foreign, "2026-11-15", "2026-11-15T18:00:00+03:00");
    expect((await request()).branchId).toBe(actual.id);
  });

  it("falls back to the assigned branch when no actual check-in exists", async () => {
    await journey(other, "2026-11-15");
    expect((await request(other.id)).branchId).toBe(assigned.id);
  });

  it("excludes another employee's newer check-in and a deleted journey", async () => {
    await journey(actual, "2026-11-12", "2026-11-12T18:00:00+03:00");
    const deleted = await journey(
      other,
      "2026-11-13",
      "2026-11-13T18:00:00+03:00",
    );
    await source.getRepository(Journey).softDelete(deleted.id);
    const another = await journey(
      other,
      "2026-11-14",
      "2026-11-14T18:00:00+03:00",
    );
    const otherEmployee = await source.getRepository(User).save({
      username: "another-employee",
      password: "unused",
      project_id: project.id,
    });
    await source
      .getRepository(Journey)
      .update(another.id, { user: otherEmployee });
    expect((await request()).branchId).toBe(actual.id);
  });

  it("uses the check-in branch in the Taqnia transactional creation path", async () => {
    await source.getRepository(Project).update(project.id, { name: "taqnia" });
    try {
      await journey(actual, "2026-11-15", "2026-11-15T18:00:00+03:00");
      expect((await request(assigned.id)).branchId).toBe(actual.id);
    } finally {
      await source
        .getRepository(Project)
        .update(project.id, { name: "branch-test" });
    }
  });

  it("can resolve a check-in branch without an assigned branch", async () => {
    await source.getRepository(User).update(employee.id, { branch: null });
    await journey(actual, "2026-11-15", "2026-11-15T18:00:00+03:00");
    expect((await request()).branchId).toBe(actual.id);
  });

  it("rejects a branchless employee instead of using an unvisited journey", async () => {
    await source.getRepository(User).update(employee.id, { branch: null });
    await journey(other, "2026-11-15");
    await expect(request()).rejects.toBeInstanceOf(NotFoundException);
  });
});
