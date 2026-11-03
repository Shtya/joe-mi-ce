import { ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of } from "rxjs";
import { LoggingInterceptor } from "common/http-logging.interceptor";

describe("Login request logging", () => {
  afterEach(() => jest.restoreAllMocks());
  it.each(["/api/v1/auth/login", "/api/v1/auth/login/?source=mobile"])(
    "does not log credentials for %s",
    async (originalUrl) => {
      const log = jest
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            method: "POST",
            originalUrl,
            body: {
              username: "employee",
              password: "secret-test",
              mac_id: "private-device",
              device_id: "private-native-id",
            },
            query: {},
          }),
        }),
      } as ExecutionContext;
      await lastValueFrom(
        new LoggingInterceptor().intercept(context, { handle: () => of({}) }),
      );
      const output = JSON.stringify(log.mock.calls);
      expect(output).toContain("employee");
      expect(output).not.toContain("secret-test");
      expect(output).not.toContain("private-device");
      expect(output).not.toContain("private-native-id");
    },
  );
});
