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
    );
    jest.spyOn(argon2, "verify").mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it("binds an unbound account to the device ID when no MAC ID is supplied", async () => {
    userRepository.findOne.mockResolvedValue({
      id: "user-1",
      username: "promoter",
      password: "hashed-password",
      is_active: true,
      device_id: null,
      mac_id: null,
      role: { name: ERole.PROMOTER },
    });
    userRepository.update.mockResolvedValue({ affected: 1 });

    await service.login({
      username: "promoter",
      password: "password",
      device_id: "device-123",
    } as any);

    expect(userRepository.update).toHaveBeenCalledWith(
      { id: "user-1", device_id: IsNull() },
      { device_id: "device-123" },
    );
  });

  it("rejects a device ID that differs from the account binding", async () => {
    userRepository.findOne.mockResolvedValue({
      id: "user-1",
      username: "promoter",
      password: "hashed-password",
      is_active: true,
      device_id: "device-123",
      mac_id: null,
      role: { name: ERole.PROMOTER },
    });

    await expect(
      service.login({
        username: "promoter",
        password: "password",
        device_id: "device-other",
      } as any),
    ).rejects.toThrow("This account is registered to another device");
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

  it("allows a bound account to log in when no MAC ID is provided", async () => {
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
    ).resolves.toEqual(expect.objectContaining({ access_token: "token" }));

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
