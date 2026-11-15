import { ForbiddenException } from "@nestjs/common";
import { IsNull } from "typeorm";
import * as argon2 from "argon2";
import { ERole } from "enums/Role.enum";
import { AuthService } from "./auth.service";

describe("AuthService MAC binding", () => {
  const userRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue("token"),
  };
  const usersService = {
    resolveProjectIdFromUser: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      userRepository as any,
      {} as any,
      {} as any,
      {} as any,
      jwtService as any,
      usersService as any,
      {} as any,
      {} as never,
    );
    jest.spyOn(argon2, "verify").mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the new project admin scope and its individual compensatory grant permission at login", async () => {
    userRepository.findOne.mockResolvedValue({
      id: "granter",
      username: "MAlhaj@aecksa.com",
      password: "hash",
      is_active: true,
      project_id: "taqnia-project",
      canGrantCompensatoryLeave: true,
      role: { name: ERole.PROJECT_ADMIN },
    });
    const result = await service.login({
      username: "MAlhaj@aecksa.com",
      password: "test",
    });
    expect(result.user.project_id).toBe("taqnia-project");
    expect(result.user.canGrantCompensatoryLeave).toBe(true);
  });

  it("binds an unbound account to the MAC ID from its first successful login", async () => {
    userRepository.findOne.mockResolvedValue({
      id: "user-1",
      username: "promoter",
      password: "hashed-password",
      is_active: true,
      mac_id: null,
      role: { name: ERole.PROMOTER },
    });
    userRepository.update.mockResolvedValue({ affected: 1 });

    await service.login({
      username: "promoter",
      password: "password",
      mac_id: "AA:BB:CC:DD:EE:FF",
    } as any);

    expect(userRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      { mac_id: "AA:BB:CC:DD:EE:FF" },
    );
  });

  it("allows an unbound account to log in without a MAC ID", async () => {
    userRepository.findOne.mockResolvedValue({
      id: "user-1",
      username: "promoter",
      password: "hashed-password",
      is_active: true,
      mac_id: null,
      role: { name: ERole.PROMOTER },
    });

    await expect(
      service.login({ username: "promoter", password: "password" } as any),
    ).resolves.toEqual(expect.objectContaining({ access_token: "token" }));

    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it("rejects a login whose MAC ID does not match the bound account", async () => {
    userRepository.findOne.mockResolvedValue({
      id: "user-1",
      username: "promoter",
      password: "hashed-password",
      is_active: true,
      mac_id: "AA:BB:CC:DD:EE:FF",
      role: { name: ERole.PROMOTER },
    });

    await expect(
      service.login({
        username: "promoter",
        password: "password",
        mac_id: "11:22:33:44:55:66",
      } as any),
    ).rejects.toThrow("This account is registered to another MAC ID");

    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it("allows an administrator to log in from another MAC ID", async () => {
    userRepository.findOne.mockResolvedValue({
      id: "admin-1",
      username: "admin",
      password: "hashed-password",
      is_active: true,
      mac_id: "AA:BB:CC:DD:EE:FF",
      role: { name: ERole.PROJECT_ADMIN },
    });

    await expect(
      service.login({
        username: "admin",
        password: "password",
        mac_id: "11:22:33:44:55:66",
      } as any),
    ).resolves.toEqual(expect.objectContaining({ access_token: "token" }));

    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it("rejects a bound account login when no MAC ID is provided", async () => {
    userRepository.findOne.mockResolvedValue({
      id: "user-1",
      username: "promoter",
      password: "hashed-password",
      is_active: true,
      mac_id: "AA:BB:CC:DD:EE:FF",
      role: { name: ERole.PROMOTER },
    });

    await expect(
      service.login({
        username: "promoter",
        password: "password",
      } as any),
    ).rejects.toThrow("MAC ID is required for this account");

    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it("rejects a first login when another device binds the account first", async () => {
    userRepository.findOne
      .mockResolvedValueOnce({
        id: "user-1",
        username: "promoter",
        password: "hashed-password",
        is_active: true,
        mac_id: null,
        role: { name: ERole.PROMOTER },
      })
      .mockResolvedValueOnce({
        id: "user-1",
        mac_id: "11:22:33:44:55:66",
      });
    userRepository.update.mockResolvedValue({ affected: 0 });

    await expect(
      service.login({
        username: "promoter",
        password: "password",
        mac_id: "AA:BB:CC:DD:EE:FF",
      } as any),
    ).rejects.toThrow("This account is registered to another MAC ID");
  });

  it("lets a project admin clear a MAC binding for a user in the same project", async () => {
    userRepository.findOne.mockResolvedValue({
      id: "user-1",
      project_id: "project-1",
      mac_id: "AA:BB:CC:DD:EE:FF",
    });
    usersService.resolveProjectIdFromUser.mockResolvedValue("project-1");
    userRepository.update.mockResolvedValue({ affected: 1 });

    await (service as any).resetMacId("user-1", {
      id: "admin-1",
      role: { name: ERole.PROJECT_ADMIN },
    } as any);

    expect(userRepository.update).toHaveBeenCalledWith("user-1", {
      mac_id: null,
    });
  });

  it("does not let a project admin clear a MAC binding outside their project", async () => {
    userRepository.findOne.mockResolvedValue({
      id: "user-1",
      project_id: "project-2",
      mac_id: "AA:BB:CC:DD:EE:FF",
    });
    usersService.resolveProjectIdFromUser.mockResolvedValue("project-1");

    await expect(
      (service as any).resetMacId("user-1", {
        id: "admin-1",
        role: { name: ERole.PROJECT_ADMIN },
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(userRepository.update).not.toHaveBeenCalled();
  });
});

describe("AuthService importSinglePromoter with vacation balances", () => {
  const userRepository = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ ...dto, id: "created-promoter-id" })),
    save: jest.fn(async (user) => user),
  };
  const roleRepository = {
    findOne: jest
      .fn()
      .mockResolvedValue({ id: "role-promoter", name: ERole.PROMOTER }),
  };
  const balances = {
    createUserBalance: jest.fn(async (values, actor, createUser) => {
      const user = await createUser({
        getRepository: () => userRepository,
      } as any);
      return { user, vacationBalance: values };
    }),
    updateUserBalance: jest.fn(),
  };
  const usersService = {
    resolveProjectIdFromUser: jest.fn().mockResolvedValue("project-1"),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      userRepository as any,
      roleRepository as any,
      {} as any,
      {} as any,
      {} as any,
      usersService as any,
      {} as any,
      balances as any,
    );
  });

  it("creates a new promoter and initializes balances atomically via createUserBalance", async () => {
    userRepository.findOne.mockResolvedValue(null);
    const actor = { id: "admin-1", role: { name: "admin" } } as any;

    const row = {
      username: "promoter-import",
      name: "New Promoter",
      "joining date": "2026-07-01",
      "annual remaining days": "14",
      "compensatory remaining days": "3",
    };

    const result = await service.importSinglePromoter(row, actor, "project-1");
    expect(balances.createUserBalance).toHaveBeenCalledWith(
      {
        joiningDate: "2026-07-01",
        annualRemainingDays: 14,
        compensatoryRemainingDays: 3,
      },
      actor,
      expect.any(Function),
    );
    expect(result).toBeDefined();
    expect(result.username).toBe("promoter-import");
  });

  it("updates balance of an existing promoter via updateUserBalance", async () => {
    const existing = {
      id: "existing-id",
      username: "existing-promoter",
      deleted_at: null,
    };
    userRepository.findOne.mockResolvedValue(existing);
    const actor = { id: "admin-1", role: { name: "admin" } } as any;

    const row = {
      username: "existing-promoter",
      name: "Existing Promoter",
      "joining date": "2026-07-01",
      "annual remaining days": "10",
      "compensatory remaining days": "2",
    };

    const result = await service.importSinglePromoter(row, actor, "project-1");
    expect(balances.updateUserBalance).toHaveBeenCalledWith(
      "existing-id",
      {
        joiningDate: "2026-07-01",
        annualRemainingDays: 10,
        compensatoryRemainingDays: 2,
      },
      actor,
    );
    expect(result).toBe(existing);
  });
});
