import { AuthController } from "src/auth/auth.controller";
import { AuthService } from "src/auth/auth.service";
import { UsersService } from "src/users/users.service";
import { ProjectController } from "src/project/project.controller";
import { ProjectService } from "src/project/project.service";
import { VacationBalanceService } from "./vacation-balance.service";
import { User } from "entities/user.entity";
import { CRUD } from "common/crud.service";

describe("vacation balances on existing response contracts", () => {
  const actor = { id: "admin", role: { name: "super_admin" } } as User;
  const employee = { id: "employee", name: "Example" };
  const balance = { annualRemainingDays: 4, compensatoryRemainingDays: 2 };
  const balances = {
    withBalances: jest.fn(async (users) =>
      users.map((user) => ({ ...user, vacationBalance: balance })),
    ),
  };
  const auth = {
    getUserById: jest.fn(async () => employee),
    userRepository: {},
  };
  const projects = { userRepo: {} };
  const controller = new AuthController(
    auth as unknown as AuthService,
    {} as UsersService,
    balances as unknown as VacationBalanceService,
  );
  const projectController = new ProjectController(
    projects as unknown as ProjectService,
    balances as unknown as VacationBalanceService,
  );
  afterEach(() => jest.restoreAllMocks());
  it("adds the balance to GET /users/:id", async () => {
    expect(await controller.getUserById("employee", { user: actor })).toEqual({
      ...employee,
      vacationBalance: balance,
    });
    expect(balances.withBalances).toHaveBeenCalledWith([employee], actor);
  });
  it("preserves teams pagination and filters while enriching records", async () => {
    const page = {
      records: [employee],
      total_records: 12,
      per_page: 10,
      current_page: 1,
    };
    const find = jest.spyOn(CRUD, "findAllRelation").mockResolvedValue(page);
    const result = await projectController.getTeamsByProject(
      "project",
      { page: 1, limit: 10 },
      { user: actor },
    );
    expect(result).toEqual({
      ...page,
      records: [{ ...employee, vacationBalance: balance }],
    });
    expect(find.mock.calls[0][9]).toEqual({ project_id: "project" });
  });
  it("also includes balances in GET /users", async () => {
    const page = {
      records: [employee],
      total_records: 1,
      per_page: 10,
      current_page: 1,
    };
    jest.spyOn(CRUD, "findAll").mockResolvedValue(page);
    expect(
      (await controller.getUsers({}, { user: actor })).records[0]
        .vacationBalance,
    ).toEqual(balance);
  });
});
