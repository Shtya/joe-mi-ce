import { DataSource } from "typeorm";
import { User } from "entities/user.entity";
import { VacationBalanceAccount } from "entities/employee/vacation-balance-account.entity";
import { VacationBalanceService } from "./vacation-balance.service";

describe("balances in employee responses", () => {
  const users = [
    { id: "one", project_id: "taqnia" },
    { id: "two", project_id: "taqnia" },
    { id: "other", project_id: "other-project" },
    { id: "missing", project_id: "taqnia" },
  ];
  const accounts = users.slice(0, 2).map((user) => ({
    userId: user.id,
    projectId: "taqnia",
    joiningDate: "2026-07-01",
    periodStart: "2026-07-01",
    project: { name: "Taqnia" },
  }));
  let actor: object;
  const manager = { find: jest.fn(), findOne: jest.fn(), query: jest.fn() };
  const service = new VacationBalanceService({
    transaction: async (_isolation, work) => work(manager),
  } as unknown as DataSource);
  beforeEach(() => {
    jest.clearAllMocks();
    actor = { id: "admin", project_id: "taqnia", role: { name: "admin" } };
    manager.findOne.mockImplementation(async () => actor);
    manager.find.mockImplementation(async (entity) =>
      entity === User
        ? users
        : entity === VacationBalanceAccount
          ? accounts
          : [],
    );
    manager.query.mockImplementation(async (sql: string) =>
      sql.includes("FROM vacation_dates")
        ? [
            {
              userId: "one",
              date: "2026-09-01",
              period: null,
              status: "approved",
              reason: "annual_leave",
            },
            {
              userId: "one",
              date: "2026-09-02",
              period: null,
              status: "pending",
              reason: "compensatory_leave",
              compensatoryTracked: true,
            },
            {
              userId: "two",
              date: "2026-09-03",
              period: null,
              status: "approved",
              reason: "weekly_leave",
            },
          ]
        : [{ userId: "one", days: "3" }],
    );
  });
  const read = () =>
    service.withBalances(
      users,
      { id: "admin" } as User,
      new Date("2026-10-01T09:00:00Z"),
    );
  it("adds separate earned annual and compensatory balances to every eligible user in a batch", async () => {
    const result = await read();
    expect(result[0].vacationBalance).toMatchObject({
      annualRemainingDays: 4.25,
      compensatoryRemainingDays: 2,
    });
    expect(result[1].vacationBalance).toMatchObject({
      annualRemainingDays: 5.25,
      compensatoryRemainingDays: 0,
    });
    expect(result[2].vacationBalance).toBeNull();
    expect(result[3].vacationBalance).toBeNull();
    expect(Object.keys(result[0].vacationBalance).sort()).toEqual([
      "annualRemainingDays",
      "compensatoryRemainingDays",
    ]);
    expect(result[0].id).toBe("one");
    expect(manager.query).toHaveBeenCalledTimes(2);
  });
  it("does not expose balances to another project's administrator", async () => {
    actor = {
      id: "admin",
      project_id: "other-project",
      role: { name: "admin" },
    };
    expect((await read()).every((user) => user.vacationBalance === null)).toBe(
      true,
    );
    expect(manager.query).not.toHaveBeenCalled();
  });
  it("limits an employee to their own balance", async () => {
    actor = { id: "one", project_id: "taqnia", role: { name: "promoter" } };
    const result = await read();
    expect(result[0].vacationBalance).not.toBeNull();
    expect(result[1].vacationBalance).toBeNull();
  });
  it("allows super admin reads", async () => {
    actor = { id: "admin", role: { name: "super_admin" } };
    expect((await read())[1].vacationBalance).not.toBeNull();
  });
  it("does no database work for an empty page", async () => {
    expect(await service.withBalances([], { id: "admin" } as User)).toEqual([]);
    expect(manager.findOne).not.toHaveBeenCalled();
  });
});
