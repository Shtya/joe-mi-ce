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
  const balance = {
    joiningDate: "2026-07-01",
    annualRemainingDays: 4,
    compensatoryRemainingDays: 2,
  };
  const balances = {
    withBalances: jest.fn(async (users) =>
      users.map((user) => ({
        ...user,
        joiningDate: balance.joiningDate,
        vacationBalance: balance,
      })),
    ),
    createUserBalance: jest.fn(),
  };
  const auth = {
    getUserById: jest.fn(async () => employee),
    register: jest.fn(async () => employee),
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
      joiningDate: "2026-07-01",
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
      { page: 1, limit: 10, search: "AEC-04" },
      { user: actor },
    );
    expect(result).toEqual({
      ...page,
      records: [
        {
          ...employee,
          joiningDate: "2026-07-01",
          vacationBalance: "Annual: 4 | Compensatory: 2",
          vacationBalanceDetails: balance,
        },
      ],
    });
    expect(find.mock.calls[0][2]).toBe("AEC-04");
    expect(find.mock.calls[0][9]).toEqual({ project_id: "project" });
  });
  it.each([-2, 0])(
    "preserves an annual balance of %s and zero compensatory days",
    async (annualRemainingDays) => {
      const detailed = { annualRemainingDays, compensatoryRemainingDays: 0 };
      jest.spyOn(CRUD, "findAllRelation").mockResolvedValue({
        records: [employee],
        total_records: 1,
        current_page: 1,
        per_page: 10,
      });
      jest
        .spyOn(balances, "withBalances")
        .mockResolvedValueOnce([{ ...employee, vacationBalance: detailed }]);
      const result = await projectController.getTeamsByProject(
        "project",
        {},
        { user: actor },
      );
      expect(result.records[0]).toMatchObject({
        vacationBalance: `Annual: ${annualRemainingDays} | Compensatory: 0`,
        vacationBalanceDetails: detailed,
      });
    },
  );
  it("localizes the teams balance display for Arabic clients", async () => {
    jest.spyOn(CRUD, "findAllRelation").mockResolvedValue({
      records: [employee],
      total_records: 1,
      current_page: 1,
      per_page: 10,
    });
    const result = await projectController.getTeamsByProject(
      "project",
      {},
      { user: actor },
      "ar-SA",
    );
    expect(result.records[0].vacationBalance).toBe("سنوي: 4 | تعويضي: 2");
    expect(result.records[0].vacationBalanceDetails).toEqual(balance);
  });
  it("keeps unavailable balances null without exposing balance details", async () => {
    jest.spyOn(CRUD, "findAllRelation").mockResolvedValue({
      records: [employee],
      total_records: 1,
      current_page: 1,
      per_page: 10,
    });
    jest
      .spyOn(balances, "withBalances")
      .mockResolvedValueOnce([{ ...employee, vacationBalance: null }]);
    const result = await projectController.getTeamsByProject(
      "project",
      {},
      { user: actor },
    );
    expect(result.records[0]).toMatchObject({
      vacationBalance: null,
      vacationBalanceDetails: null,
    });
  });
  it("also includes balances in GET /users", async () => {
    const page = {
      records: [employee],
      total_records: 1,
      per_page: 10,
      current_page: 1,
    };
    jest.spyOn(CRUD, "findAll").mockResolvedValue(page);
    const usersResult = await controller.getUsers({}, { user: actor });
    expect(usersResult.records[0].joiningDate).toBe("2026-07-01");
    expect(usersResult.records[0].vacationBalance).toEqual(balance);
  });

  it("initializes balance atomically and enriches response in POST /auth/register", async () => {
    const registerDto = {
      username: "newuser",
      password: "password123",
      name: "New User",
      role: "promoter",
      joiningDate: "2026-07-01",
      annualRemainingDays: 14,
      compensatoryRemainingDays: 3,
    };
    const createdUser = {
      id: "new-user-id",
      name: "New User",
      username: "newuser",
    };
    (auth.register as jest.Mock).mockResolvedValueOnce(createdUser);
    (balances.createUserBalance as jest.Mock).mockImplementationOnce(
      async (values, actorUser, createFn) => {
        const user = await createFn({} as any);
        return {
          user,
          vacationBalance: {
            joiningDate: values.joiningDate,
            annualRemainingDays: values.annualRemainingDays,
            compensatoryRemainingDays: values.compensatoryRemainingDays,
          },
        };
      },
    );

    const result = await controller.register(
      { user: actor },
      registerDto as any,
    );
    expect(balances.createUserBalance).toHaveBeenCalledWith(
      {
        joiningDate: "2026-07-01",
        annualRemainingDays: 14,
        compensatoryRemainingDays: 3,
      },
      actor,
      expect.any(Function),
    );
    expect(result).toEqual({
      ...createdUser,
      joiningDate: "2026-07-01",
      vacationBalance: {
        joiningDate: "2026-07-01",
        annualRemainingDays: 14,
        compensatoryRemainingDays: 3,
      },
    });
  });

  it("registers normally and enriches via withBalances when no balance fields are provided", async () => {
    const registerDto = {
      username: "plainuser",
      password: "password123",
      name: "Plain User",
      role: "promoter",
    };
    const createdUser = {
      id: "plain-user-id",
      name: "Plain User",
      username: "plainuser",
    };
    (auth.register as jest.Mock).mockResolvedValueOnce(createdUser);

    const result = await controller.register(
      { user: actor },
      registerDto as any,
    );
    expect(auth.register).toHaveBeenCalledWith(actor, registerDto, undefined);
    expect(balances.withBalances).toHaveBeenCalledWith([createdUser], actor);
    expect(result).toEqual({
      ...createdUser,
      joiningDate: "2026-07-01",
      vacationBalance: balance,
    });
  });
});
