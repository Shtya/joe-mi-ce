import { ForbiddenException, Logger } from "@nestjs/common";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";
import { ERole } from "enums/Role.enum";

describe("Login failure diagnostics", () => {
  const users = { findOne: jest.fn(), update: jest.fn() };
  let service: AuthService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      users as never,
      {} as never,
      {} as never,
      {} as never,
      { signAsync: jest.fn().mockResolvedValue("token") } as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(argon2, "verify").mockResolvedValue(true);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    users.findOne.mockResolvedValue({
      id: "employee",
      username: "employee",
      password: "hash",
      is_active: true,
      mac_id: "bound-device",
      role: { name: ERole.PROMOTER },
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it("explains a missing device ID in Arabic without weakening device binding", async () => {
    try {
      await Reflect.apply(service.login, service, [
        { username: "employee", password: "secret-test" },
        "ar-SA",
      ]);
      throw new Error("Expected rejection");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const response = (error as ForbiddenException).getResponse();
      expect(response).toMatchObject({
        code: "DEVICE_ID_REQUIRED",
        message: expect.stringMatching(/الجهاز/),
        requestId: expect.any(String),
      });
    }
    expect(users.update).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "auth.login.rejected",
        reason: "DEVICE_ID_REQUIRED",
      }),
    );
    expect(
      JSON.stringify(jest.mocked(Logger.prototype.warn).mock.calls),
    ).not.toContain("secret-test");
    expect(
      JSON.stringify(jest.mocked(Logger.prototype.warn).mock.calls),
    ).not.toContain("bound-device");
  });

  it("distinguishes a different device from a missing device", async () => {
    await expect(
      service.login({
        username: "employee",
        password: "secret-test",
        mac_id: "different",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "DEVICE_MISMATCH" }),
    });
    expect(users.update).not.toHaveBeenCalled();
  });

  it("records accepted logins without including tokens", async () => {
    const result = await service.login({
      username: "employee",
      password: "secret-test",
      mac_id: "bound-device",
    });
    expect(result.access_token).toBe("token");
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "auth.login.accepted" }),
    );
    const logs = JSON.stringify(jest.mocked(Logger.prototype.log).mock.calls);
    expect(logs).not.toContain("secret-test");
    expect(logs).not.toContain("bound-device");
    expect(logs).not.toContain('"token"');
  });
});
