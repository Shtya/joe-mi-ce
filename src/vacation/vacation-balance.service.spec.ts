import { ForbiddenException, BadRequestException } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { User } from "entities/user.entity";
import { VacationBalanceService } from "./vacation-balance.service";
import { Project } from "entities/project.entity";
import { VacationBalanceAccount } from "entities/employee/vacation-balance-account.entity";
import { VacationCompensatoryCredit } from "entities/employee/vacation-compensatory-credit.entity";
import { VacationAnnualAdjustment } from "entities/employee/vacation-annual-adjustment.entity";

describe("VacationBalanceService isolation", () => {
  const target = {
    id: "employee",
    project_id: "taqnia-id",
    branch: null,
    project: null,
  };
  const manager = {
    findOne: jest.fn(),
    query: jest.fn(),
    save: jest.fn(),
  };
  const source = {
    transaction: (work: (em: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
  };
  const service = new VacationBalanceService(source as unknown as DataSource);

  beforeEach(() => {
    jest.clearAllMocks();
    manager.findOne.mockImplementation(async (entity, options) => {
      if (entity === User) {
        return options.where.id === "employee"
          ? target
          : { id: "admin", project_id: "other-id", role: { name: "admin" } };
      }
      return { id: "taqnia-id", name: "taqnia" };
    });
  });

  it("denies admins of another project access to Taqnia balances", async () => {
    await expect(
      service.getBalance("employee", { id: "admin" } as User),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("does not enable balances for other projects", async () => {
    manager.findOne
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce({ name: "other-project" });
    await expect(
      service.getBalance("employee", { id: "employee" } as User),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe("earned balances and reservations", () => {
    let credit: number;
    let usage: {
      date: string;
      period: string;
      annual: string;
      compensatory: string;
      status: string;
    }[];
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date("2026-10-01T09:00:00Z"));
      credit = 2;
      usage = [];
      manager.findOne.mockImplementation(async (entity, options) => {
        if (entity === User) {
          return options.where.id === "employee"
            ? target
            : {
                id: "admin",
                project_id: "taqnia-id",
                role: { name: "admin" },
                is_active: true,
                canGrantCompensatoryLeave: true,
              };
        }
        if (entity === Project) return { id: "taqnia-id", name: "taqnia" };
        if (entity === VacationBalanceAccount) {
          return {
            userId: "employee",
            projectId: "taqnia-id",
            joiningDate: "2026-07-01",
            periodStart: "2026-07-01",
          };
        }
        return null;
      });
      manager.query.mockImplementation(async (sql: string) =>
        sql.includes("vacation_annual_adjustments")
          ? []
          : sql.includes("SUM(days)")
            ? [{ days: String(credit) }]
            : usage.map((row) => ({
                ...row,
                reason:
                  Number(row.compensatory) > 0
                    ? "compensatory_leave"
                    : "annual_leave",
                compensatoryTracked: true,
              })),
      );
      manager.save.mockImplementation(async (entity, record) => {
        if (entity === VacationCompensatoryCredit) {
          credit += Number(record.days);
        }
        return record;
      });
    });
    afterEach(() => jest.useRealTimers());

    it("subtracts both pending and approved days and keeps compensatory credits separate", async () => {
      usage = [
        {
          date: "2026-09-01",
          period: "2026-07-01",
          annual: "1",
          compensatory: "0",
          status: "approved",
        },
        {
          date: "2026-10-02",
          period: "2026-07-01",
          annual: "0",
          compensatory: "1",
          status: "pending",
        },
      ];
      const balance = await service.getBalance("employee", {
        id: "employee",
      } as User);
      expect(balance.accruedDays).toBe(5.25);
      expect(balance.annualRemainingDays).toBe(4.25);
      expect(balance.compensatoryRemainingDays).toBe(1);
      expect(balance.availableDays).toBe(5.25);
      expect(balance.pendingReservedDays).toBe(1);
    });

    it("rejects overspending and reports the actual available balance", async () => {
      const em = manager as unknown as EntityManager;
      await expect(
        service.allocate(em, target as User, Array(8).fill("2026-10-02")),
      ).rejects.toMatchObject({
        response: {
          code: "INSUFFICIENT_VACATION_BALANCE",
          availableDays: 5.25,
        },
      });
    });

    it("expires old annual credit on the anniversary and retains compensatory spending", async () => {
      usage = [
        {
          date: "2026-09-01",
          period: "2026-07-01",
          annual: "1",
          compensatory: "1",
          status: "approved",
        },
      ];
      const balance = await service.getBalance(
        "employee",
        { id: "employee" } as User,
        new Date("2027-07-01T09:00:00Z"),
      );
      expect(balance.accruedDays).toBe(0);
      expect(balance.annualUsedOrReservedDays).toBe(0);
      expect(balance.compensatoryRemainingDays).toBe(1);
      expect(balance.availableDays).toBe(1);
    });

    it("adds admin grants to the usable balance", async () => {
      const balance = await service.grantCompensatory(
        "employee",
        3,
        "Extra work",
        { id: "admin" } as User,
      );
      expect(balance.compensatoryGrantedDays).toBe(5);
      expect(balance.availableDays).toBe(10.25);
    });

    it("does not let employees grant their own compensatory credit", async () => {
      await expect(
        service.grantCompensatory("employee", 3, "Extra work", {
          id: "employee",
        } as User),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each(["admin", "super_admin"])(
      "denies %s without the explicit user-level grant permission",
      async (role) => {
        manager.findOne.mockImplementation(async (entity) => {
          if (entity === User) {
            return {
              ...target,
              id: "other-admin",
              role: { name: role },
              is_active: true,
              canGrantCompensatoryLeave: false,
            };
          }
          if (entity === Project) return { name: "taqnia" };
          return null;
        });
        await expect(
          service.grantCompensatory("employee", 3, "Extra work", {
            id: "other-admin",
          } as User),
        ).rejects.toBeInstanceOf(ForbiddenException);
      },
    );

    it("does not borrow annual accrual from the next contract year", async () => {
      credit = 0;
      await expect(
        service.allocate(manager as unknown as EntityManager, target as User, [
          "2027-07-02",
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("does not let annual overuse consume compensatory credits", async () => {
      usage = Array.from({ length: 7 }, (_, index) => ({
        date: `2026-09-0${index + 1}`,
        period: "2026-07-01",
        annual: "1",
        compensatory: "0",
        status: "approved",
      }));
      const balance = await service.getBalance("employee", {
        id: "employee",
      } as User);
      expect(balance.annualRemainingDays).toBe(-1.75);
      expect(balance.availableDays).toBe(2);
      await expect(
        service.allocate(manager as unknown as EntityManager, target as User, [
          "2026-10-02",
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
      const dates = await service.allocate(
        manager as unknown as EntityManager,
        target as User,
        ["2026-10-02"],
        "en",
        undefined,
        "compensatory_leave",
      );
      expect(dates[0]).toMatchObject({
        annualBalanceDays: "0",
        compensatoryBalanceDays: "1",
      });
    });

    it("does not charge pre-employment historical leave against the joining contract year", async () => {
      usage = [
        {
          date: "2026-06-01",
          period: null,
          annual: "10",
          compensatory: "0",
          status: "approved",
        },
      ];
      const balance = await service.getBalance("employee", {
        id: "employee",
      } as User);
      expect(balance.annualUsedOrReservedDays).toBe(0);
      expect(balance.availableDays).toBe(7.25);
    });

    it("does not spend compensatory credits when annual leave exceeds annual accrual", async () => {
      await expect(
        service.allocate(
          manager as unknown as EntityManager,
          target as User,
          Array(6).fill("2026-10-02"),
          "en",
          undefined,
          "annual_leave",
        ),
      ).rejects.toMatchObject({
        response: { availableDays: 5.25, balanceType: "annual" },
      });
    });

    it("does not spend annual accrual when compensatory leave exceeds the granted credit", async () => {
      await expect(
        service.allocate(
          manager as unknown as EntityManager,
          target as User,
          Array(3).fill("2026-10-02"),
          "en",
          undefined,
          "compensatory_leave",
        ),
      ).rejects.toMatchObject({
        response: { availableDays: 2, balanceType: "compensatory" },
      });
    });

    it.each(["weekend_vacation", "sick_leave", "permission_or_absence"])(
      "allows %s without a balance or joining date",
      async (reason) => {
        manager.findOne.mockImplementation(async (entity) =>
          entity === Project ? { name: "taqnia" } : null,
        );
        expect(
          await service.allocate(
            manager as unknown as EntityManager,
            target as User,
            ["2026-10-02"],
            "en",
            undefined,
            reason,
          ),
        ).toEqual([{}]);
      },
    );

    // The admin mock from the enclosing beforeEach, minus the balance
    // account: the employee has no registered joining date yet.
    const withoutJoiningDate = () => {
      manager.findOne.mockImplementation(async (entity, options) => {
        if (entity === User) {
          return options.where.id === "employee"
            ? target
            : {
                id: "admin",
                project_id: "taqnia-id",
                role: { name: "admin" },
                is_active: true,
                canGrantCompensatoryLeave: true,
              };
        }
        if (entity === Project) return { id: "taqnia-id", name: "taqnia" };
        return null;
      });
    };

    it("grants compensatory days without a joining date", async () => {
      withoutJoiningDate();
      const balance = await service.grantCompensatory(
        "employee",
        3,
        "Extra work",
        { id: "admin" } as User,
      );
      expect(balance.joiningDate).toBeNull();
      expect(balance.periodStart).toBeNull();
      expect(balance.accruedDays).toBe(0);
      expect(balance.annualRemainingDays).toBe(0);
      expect(balance.compensatoryGrantedDays).toBe(5);
      expect(balance.compensatoryRemainingDays).toBe(5);
      expect(balance.availableDays).toBe(5);
    });

    it("sets compensatory remaining days without a joining date", async () => {
      withoutJoiningDate();
      const result = await service.setCompensatoryRemainingDays("employee", 2, {
        id: "admin",
      } as User);
      expect(result.vacationBalance.compensatoryRemainingDays).toBe(2);
    });

    it("reports a compensatory-only balance without a joining date", async () => {
      withoutJoiningDate();
      usage = [
        {
          date: "2026-10-02",
          period: null,
          annual: "0",
          compensatory: "1",
          status: "pending",
        },
      ];
      const balance = await service.getBalance("employee", {
        id: "employee",
      } as User);
      expect(balance.joiningDate).toBeNull();
      expect(balance.annualRemainingDays).toBe(0);
      expect(balance.compensatoryRemainingDays).toBe(1);
      expect(balance.pendingReservedDays).toBe(1);
    });

    it("allocates compensatory leave without a joining date", async () => {
      withoutJoiningDate();
      expect(
        await service.allocate(
          manager as unknown as EntityManager,
          target as User,
          ["2026-10-02"],
          "en",
          undefined,
          "compensatory_leave",
        ),
      ).toEqual([
        {
          balancePeriodStart: null,
          annualBalanceDays: "0",
          compensatoryBalanceDays: "1",
        },
      ]);
    });

    it("still requires the joining date for annual leave", async () => {
      withoutJoiningDate();
      await expect(
        service.allocate(manager as unknown as EntityManager, target as User, [
          "2026-10-02",
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("createUserBalance", () => {
    const adminUser = {
      id: "admin",
      project_id: "taqnia-id",
      role: { name: "admin" },
      is_active: true,
      canGrantCompensatoryLeave: true,
    } as User;
    let credit = 0;
    let annualAdjustments = 0;

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date("2026-10-01T09:00:00Z"));
      credit = 0;
      annualAdjustments = 0;
      manager.findOne.mockImplementation(async (entity, options) => {
        if (entity === User) {
          if (options?.where?.id === "admin") return adminUser;
          return {
            id: "new-user",
            project_id: "taqnia-id",
            role: { name: "promoter" },
          };
        }
        if (entity === Project) return { id: "taqnia-id", name: "taqnia" };
        if (entity === VacationBalanceAccount) {
          return {
            userId: "new-user",
            projectId: "taqnia-id",
            joiningDate: "2026-07-01",
            periodStart: "2026-07-01",
          };
        }
        return null;
      });
      manager.query.mockImplementation(async (sql: string) => {
        if (sql.includes("vacation_annual_adjustments")) {
          return [{ days: String(annualAdjustments) }];
        }
        if (sql.includes("SUM(days)")) {
          return [{ days: String(credit) }];
        }
        return [];
      });
      manager.save.mockImplementation(async (entity, record) => {
        if (entity === VacationCompensatoryCredit) {
          credit += Number(record.days);
        }
        if (entity === VacationAnnualAdjustment) {
          annualAdjustments += Number(record.days);
        }
        return record;
      });
    });

    it("rejects invalid inputs before creating user", async () => {
      const createUser = jest.fn();
      await expect(
        service.createUserBalance(
          { annualRemainingDays: 25 },
          adminUser,
          createUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.createUserBalance(
          { compensatoryRemainingDays: -1 },
          adminUser,
          createUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.createUserBalance(
          { joiningDate: "bad-date" },
          adminUser,
          createUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createUser).not.toHaveBeenCalled();
    });

    it("rejects setting balance adjustments without permission", async () => {
      const createUser = jest.fn();
      manager.findOne.mockImplementation(async (entity, options) => {
        if (entity === User && options?.where?.id === "admin") {
          return { ...adminUser, canGrantCompensatoryLeave: false };
        }
        return null;
      });
      await expect(
        service.createUserBalance(
          { joiningDate: "2026-07-01", annualRemainingDays: 14 },
          adminUser,
          createUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(createUser).not.toHaveBeenCalled();
    });

    it("rejects balance fields for non-Taqnia projects and rolls back", async () => {
      const createdUser = { id: "non-taqnia-user", name: "Non Taqnia" };
      const createUser = jest.fn(async () => createdUser);
      manager.findOne.mockImplementation(async (entity, options) => {
        if (entity === User) {
          if (options?.where?.id === "admin") return adminUser;
          return {
            id: "non-taqnia-user",
            project_id: "other-id",
            role: { name: "promoter" },
          };
        }
        if (entity === Project)
          return { id: "other-id", name: "Other Project" };
        return null;
      });

      await expect(
        service.createUserBalance(
          { joiningDate: "2026-07-01", annualRemainingDays: 14 },
          adminUser,
          createUser,
        ),
      ).rejects.toThrow("Vacation balances are enabled for Taqnia only");
      expect(createUser).toHaveBeenCalled();
    });

    it("creates balance account and adjustments atomically during employee creation", async () => {
      const createdUser = {
        id: "new-user",
        username: "newemp",
        name: "New Employee",
      };
      const createUser = jest.fn(async () => createdUser);

      const result = await service.createUserBalance(
        {
          joiningDate: "2026-07-01",
          annualRemainingDays: 14,
          compensatoryRemainingDays: 3,
        },
        adminUser,
        createUser,
      );

      expect(createUser).toHaveBeenCalled();
      expect(manager.save).toHaveBeenCalledWith(
        VacationBalanceAccount,
        expect.objectContaining({
          userId: "new-user",
          projectId: "taqnia-id",
          joiningDate: "2026-07-01",
        }),
      );
      expect(result).toEqual({
        user: createdUser,
        vacationBalance: {
          joiningDate: "2026-07-01",
          annualRemainingDays: 14,
          compensatoryRemainingDays: 3,
        },
      });
    });
  });
});
