import { ExecutionContext, Logger } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";

describe("Authentication infrastructure failures", () => {
  const jwt = { verifyAsync: jest.fn() };
  const users = { findOne: jest.fn() };
  const request = { headers: { authorization: "Bearer valid-token" } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
  } as ExecutionContext;
  let guard: AuthGuard;
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jwt.verifyAsync.mockResolvedValue({ sub: "employee" });
    users.findOne.mockResolvedValue({
      id: "employee",
      is_active: true,
      role: { name: "promoter" },
    });
    guard = new AuthGuard(
      jwt as never,
      { get: () => undefined } as never,
      { t: (key: string) => key } as never,
      users as never,
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it("does not misreport a database timeout as an invalid token that logs the user out", async () => {
    users.findOne.mockRejectedValue(new Error("database connection timeout"));
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 503,
    });
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "auth.session.lookup_failed" }),
    );
  });

  it("still rejects invalid tokens with 401 without querying the database", async () => {
    jwt.verifyAsync.mockRejectedValue(new Error("invalid signature"));
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
    expect(users.findOne).not.toHaveBeenCalled();
  });

  it("still rejects inactive accounts with 403", async () => {
    users.findOne.mockResolvedValue({ id: "employee", is_active: false });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("accepts a valid session", async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("rejects tokens without a subject before a repository query can match an unintended user", async () => {
    jwt.verifyAsync.mockResolvedValue({});
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
    expect(users.findOne).not.toHaveBeenCalled();
  });

  it("rejects removed accounts with 401", async () => {
    users.findOne.mockResolvedValue(null);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
  });
});
