import { AuthService } from "src/auth/auth.service";
import { AuthController } from "src/auth/auth.controller";
import { Role } from "entities/role.entity";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "src/users/users.service";
import { ProjectService } from "src/project/project.service";
import "reflect-metadata";
import { readFileSync, mkdtempSync, rmSync } from "fs";
import { Workbook } from "exceljs";
import { UsersController } from "src/users/users.controller";
import { JourneyService } from "src/journey/journey.service";
import { DataSource } from "typeorm";
import { User } from "entities/user.entity";
import { Project } from "entities/project.entity";
import { Branch } from "entities/branch.entity";
import { Vacation } from "entities/employee/vacation.entity";
import { VacationDate } from "entities/employee/vacation-date.entity";
import { Journey } from "entities/all_plans.entity";
import { VacationBalanceService } from "./vacation-balance.service";
import { VacationService } from "./vacation.service";
import { readVacationBalanceImport } from "./vacation-balance-excel";

// Opt-in: uses only this named disposable local database, never application env.
const integration =
  process.env.TAQNIA_TEST_POSTGRES === "1" ? describe : describe.skip;
integration("Taqnia vacation PostgreSQL integration", () => {
  let source: DataSource;
  let balances: VacationBalanceService;
  let vacations: VacationService;
  let employee: User;
  let admin: User;
  let branch: Branch;

  beforeAll(async () => {
    // Freeze only the business clock; PostgreSQL network timers stay real.
    jest.useFakeTimers({
      now: new Date("2026-10-26T09:00:00Z"),
      doNotFake: [
        "hrtime",
        "nextTick",
        "performance",
        "queueMicrotask",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
    source = new DataSource({
      type: "postgres",
      host: "/tmp",
      port: 55439,
      username: "mostafa",
      database: "taqnia_vacation_test",
      entities: [`${process.cwd()}/entities/**/*.entity.ts`],
      synchronize: true,
      dropSchema: true,
    });
    await source.initialize();
    await source.query(
      "ALTER TABLE users DROP COLUMN can_grant_compensatory_leave",
    );
    await source.query(
      readFileSync(
        "database/20261028_compensatory_grant_permission.sql",
        "utf8",
      ),
    );
    await source.query(
      readFileSync(
        "database/20261028_compensatory_grant_permission.sql",
        "utf8",
      ),
    );
    // Reconstruct the previous schema so CREATE/ALTER are tested, not merely
    // the migration's IF NOT EXISTS rerun paths after TypeORM synchronize.
    await source.query(`DROP TABLE vacation_compensatory_credits; DROP TABLE vacation_balance_accounts;
      ALTER TABLE vacation_dates DROP COLUMN balance_period_start, DROP COLUMN annual_balance_days, DROP COLUMN compensatory_balance_days;`);
    await source.query(
      readFileSync("database/20261026_taqnia_vacation_balances.sql", "utf8"),
    );
    await source.query(
      readFileSync("database/20261026_taqnia_vacation_balances.sql", "utf8"),
    );
    for (let run = 0; run < 2; run++) {
      await source.query(
        readFileSync(
          "database/20261103_compensatory_balance_adjustments.sql",
          "utf8",
        ),
      );
    }
    await source.query("DROP TABLE vacation_annual_adjustments");
    for (let run = 0; run < 2; run++) {
      await source.query(
        readFileSync(
          "database/20261112_vacation_annual_adjustments.sql",
          "utf8",
        ),
      );
    }
    for (let run = 0; run < 2; run++) {
      await source.query(
        readFileSync(
          "database/20261115_compensatory_credits_employee_fk.sql",
          "utf8",
        ),
      );
    }
    balances = new VacationBalanceService(source);
    vacations = new VacationService(
      source.getRepository(Vacation),
      source.getRepository(VacationDate),
      source.getRepository(User),
      source.getRepository(Branch),
      source.getRepository(Journey),
      balances,
    );
    const project = await source
      .getRepository(Project)
      .save({ name: "taqnia" });
    branch = await source
      .getRepository(Branch)
      .save({ name: "Test branch", project });
    admin = await source.getRepository(User).save({
      username: "integration-admin",
      password: "unused",
      project_id: project.id,
      canGrantCompensatoryLeave: true,
    });
    // A real role is required by the server-side authorization check.
    const roles: { id: string }[] = await source.query(
      `INSERT INTO roles (id,name) VALUES (gen_random_uuid(),'admin') RETURNING id`,
    );
    await source.query(`UPDATE users SET "roleId"=$1 WHERE id=$2`, [
      roles[0].id,
      admin.id,
    ]);
    employee = await source.getRepository(User).save({
      username: "integration-employee",
      password: "unused",
      project_id: project.id,
      branch,
    });
    await balances.setJoiningDate(employee.id, "2026-07-01", admin);
  }, 30000);

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
    jest.useRealTimers();
  });

  describe("compensatory credits without an annual balance account", () => {
    let target: User;

    beforeEach(async () => {
      target = await source.getRepository(User).save({
        username: "compensatory-only-employee",
        password: "unused",
        project_id: employee.project_id,
        branch,
      });
    });

    afterEach(async () => {
      await source.getRepository(User).delete(target.id);
    });

    it("grants days before a joining date and retains them when the date is registered", async () => {
      const balance = await balances.grantCompensatory(
        target.id,
        3,
        "overtime",
        admin,
      );
      expect(balance.joiningDate).toBeNull();
      expect(balance.annualRemainingDays).toBe(0);
      expect(balance.compensatoryRemainingDays).toBe(3);
      expect(
        await source.query(
          "SELECT user_id FROM vacation_balance_accounts WHERE user_id=$1",
          [target.id],
        ),
      ).toEqual([]);
      await balances.setJoiningDate(target.id, "2026-07-01", admin);
      expect(
        (await balances.getBalance(target.id, admin)).compensatoryRemainingDays,
      ).toBe(3);
    });

    it("sets and reduces a compensatory-only balance without creating an annual account", async () => {
      await balances.setCompensatoryRemainingDays(target.id, 3, admin);
      await balances.setCompensatoryRemainingDays(target.id, 2, admin);
      const balance = await balances.getBalance(target.id, admin);
      expect(balance.joiningDate).toBeNull();
      expect(balance.compensatoryRemainingDays).toBe(2);
    });

    it("imports, edits and reimports both remaining balances without duplicating credit", async () => {
      const users = new UsersService(
        source.getRepository(User),
        source.getRepository(Branch),
        source.getRepository(Project),
        source,
        balances,
      );
      const row = {
        Username: target.username,
        "Joining Date": "2026-07-01",
        "Annual Remaining Days": "14",
        "Compensatory Remaining Days": "3",
      };
      for (let run = 0; run < 2; run++) {
        expect(await users.importUsersData([row], false, admin)).toMatchObject({
          updatedCount: 1,
          errors: [],
        });
      }
      expect(
        balances.summary(await balances.getBalance(target.id, admin)),
      ).toEqual({
        joiningDate: "2026-07-01",
        annualRemainingDays: 14,
        compensatoryRemainingDays: 3,
      });
      expect(
        await source.query(
          "SELECT count(*)::int AS count FROM vacation_compensatory_credits WHERE user_id=$1",
          [target.id],
        ),
      ).toEqual([{ count: 1 }]);
      expect(
        await source.query(
          "SELECT count(*)::int AS count FROM vacation_annual_adjustments WHERE user_id=$1",
          [target.id],
        ),
      ).toEqual([{ count: 1 }]);
      expect(
        await users.importUsersData(
          [
            {
              ...row,
              "Annual Remaining Days": "12",
              "Compensatory Remaining Days": "2",
            },
          ],
          false,
          admin,
        ),
      ).toMatchObject({ updatedCount: 1, errors: [] });
      expect(
        balances.summary(await balances.getBalance(target.id, admin)),
      ).toEqual({
        joiningDate: "2026-07-01",
        annualRemainingDays: 12,
        compensatoryRemainingDays: 2,
      });
      await users.importUsersData(
        [
          {
            Username: target.username,
            "Annual Remaining Days": "0",
            "Compensatory Remaining Days": "",
          },
        ],
        false,
        admin,
      );
      expect(
        (await balances.getBalance(target.id, admin)).annualRemainingDays,
      ).toBe(0);
      expect(
        (await balances.getBalance(target.id, admin)).compensatoryRemainingDays,
      ).toBe(2);
    });

    it("previews without writes and rejects unauthorized or invalid balance rows atomically", async () => {
      const users = new UsersService(
        source.getRepository(User),
        source.getRepository(Branch),
        source.getRepository(Project),
        source,
        balances,
      );
      const row = {
        Username: target.username,
        "Joining Date": "2026-07-01",
        "Annual Remaining Days": "14",
        "Compensatory Remaining Days": "3",
        Phone: "555000123",
      };
      expect(await users.importUsersData([row], true, admin)).toMatchObject({
        updatedCount: 1,
        errors: [],
        preview: [
          {
            proposed: { annualRemainingDays: 14, compensatoryRemainingDays: 3 },
          },
        ],
      });
      expect(
        await source.query(
          "SELECT user_id FROM vacation_balance_accounts WHERE user_id=$1",
          [target.id],
        ),
      ).toEqual([]);
      expect(
        (await source.getRepository(User).findOneByOrFail({ id: target.id }))
          .mobile,
      ).toBeNull();
      for (const dryRun of [true, false]) {
        const result = await users.importUsersData([row], dryRun, employee);
        expect(result.updatedCount).toBe(0);
        expect(result.errors).toHaveLength(1);
      }
      const invalid = await users.importUsersData(
        [{ ...row, "Annual Remaining Days": "22" }],
        false,
        admin,
      );
      expect(invalid.updatedCount).toBe(0);
      expect(
        (await source.getRepository(User).findOneByOrFail({ id: target.id }))
          .mobile,
      ).toBeNull();
    });

    it("supports reimport through the existing promoter import and exports a compensatory-only balance", async () => {
      const users = new UsersService(
        source.getRepository(User),
        source.getRepository(Branch),
        source.getRepository(Project),
        source,
        balances,
      );
      const auth = new AuthService(
        source.getRepository(User),
        source.getRepository(Role),
        source.getRepository(Project),
        source.getRepository(Branch),
        {} as JwtService,
        users,
        {} as ProjectService,
        balances,
      );
      const row = auth.mapHeaders({
        Username: target.username,
        Name: "Employee",
        "Compensatory Remaining Days": "3",
      });
      await auth.importSinglePromoter(row, admin);
      await auth.importSinglePromoter(row, admin);
      const records = await balances.withBalances([target], admin);
      expect(records[0].vacationBalance).toEqual({
        joiningDate: null,
        annualRemainingDays: 0,
        compensatoryRemainingDays: 3,
      });
      expect(
        readVacationBalanceImport({
          "Annual Remaining Days": "12",
          "Compensatory Remaining Days": "0",
        }),
      ).toEqual({ annualRemainingDays: 12, compensatoryRemainingDays: 0 });
    });

    it("reads annual and compensatory columns from an actual XLSX upload twice", async () => {
      const users = new UsersService(
        source.getRepository(User),
        source.getRepository(Branch),
        source.getRepository(Project),
        source,
        balances,
      );
      const controller = new UsersController(users, {} as JourneyService);
      const folder = mkdtempSync("/tmp/taqnia-balance-upload-");
      const filePath = `${folder}/balances.xlsx`;
      try {
        const workbook = new Workbook();
        const sheet = workbook.addWorksheet("Employees");
        sheet.addRow([
          "Username",
          "Joining Date",
          "Annual Remaining Days",
          "Compensatory Remaining Days",
        ]);
        sheet.addRow([
          target.username,
          new Date("2026-07-01T00:00:00Z"),
          14,
          3,
        ]);
        for (let run = 0; run < 2; run++) {
          await workbook.xlsx.writeFile(filePath);
          const result = await controller.importUsers(
            {
              path: filePath,
              originalname: "balances.xlsx",
              mimetype:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            } as Express.Multer.File,
            { user: admin },
          );
          expect(result).toMatchObject({ updatedCount: 1, errors: [] });
        }
        expect(
          balances.summary(await balances.getBalance(target.id, admin)),
        ).toEqual({
          joiningDate: "2026-07-01",
          annualRemainingDays: 14,
          compensatoryRemainingDays: 3,
        });
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    });

    it("creates a promoter and both balances atomically and rejects another project's balance import", async () => {
      const users = new UsersService(
        source.getRepository(User),
        source.getRepository(Branch),
        source.getRepository(Project),
        source,
        balances,
      );
      const auth = new AuthService(
        source.getRepository(User),
        source.getRepository(Role),
        source.getRepository(Project),
        source.getRepository(Branch),
        {} as JwtService,
        users,
        {} as ProjectService,
        balances,
      );
      const role = await source.getRepository(Role).save({ name: "promoter" });
      const imported = await auth.importSinglePromoter(
        {
          username: "xlsx-new-employee",
          name: "Imported employee",
          joiningDate: "2026-07-01",
          annualRemainingDays: 14,
          compensatoryRemainingDays: 3,
        },
        admin,
        employee.project_id,
        role,
      );
      try {
        expect(
          balances.summary(await balances.getBalance(imported.id, admin)),
        ).toEqual({
          joiningDate: "2026-07-01",
          annualRemainingDays: 14,
          compensatoryRemainingDays: 3,
        });
      } finally {
        await source.getRepository(User).delete(imported.id);
      }
      const other = await source
        .getRepository(Project)
        .save({ name: "Other Excel Project" });
      await source
        .getRepository(User)
        .update(target.id, { project_id: other.id, branch: null });
      const result = await users.importUsersData(
        [{ Username: target.username, "Compensatory Remaining Days": 3 }],
        false,
        admin,
      );
      expect(result.updatedCount).toBe(0);
      expect(result.errors).toHaveLength(1);
    });

    it("migrates a generated legacy FK twice while preserving existing credits and employee cleanup", async () => {
      await balances.setJoiningDate(target.id, "2026-07-01", admin);
      await balances.grantCompensatory(target.id, 3, "overtime", admin);
      await source.query(`
        ALTER TABLE vacation_compensatory_credits
          DROP CONSTRAINT vacation_compensatory_credits_user_id_fkey;
        ALTER TABLE vacation_compensatory_credits
          ADD CONSTRAINT "FK_legacy_generated_account"
          FOREIGN KEY (user_id) REFERENCES vacation_balance_accounts(user_id) ON DELETE CASCADE;
      `);
      const migration = readFileSync(
        "database/20261115_compensatory_credits_employee_fk.sql",
        "utf8",
      );
      await source.query(migration);
      await source.query(migration);
      await source.query(
        "DELETE FROM vacation_balance_accounts WHERE user_id=$1",
        [target.id],
      );
      expect(
        (await balances.getBalance(target.id, admin)).compensatoryRemainingDays,
      ).toBe(3);
      expect(
        await source.query(
          "SELECT days, reason, granted_by FROM vacation_compensatory_credits WHERE user_id=$1",
          [target.id],
        ),
      ).toEqual([{ days: "3.0000", reason: "overtime", granted_by: admin.id }]);
      await source.getRepository(User).delete(target.id);
      expect(
        await source.query(
          "SELECT id FROM vacation_compensatory_credits WHERE user_id=$1",
          [target.id],
        ),
      ).toEqual([]);
    });
  });

  const request = (dates: string[], reason = "annual_leave") =>
    vacations.createVacation(
      {
        userId: employee.id,
        branchId: branch.id,
        dates,
        reason,
      },
      null,
      "en",
      employee,
    );

  it("returns the same balance in bulk responses and the individual endpoint", async () => {
    const single = await balances.getBalance(employee.id, admin);
    const response = await balances.withBalances([employee, admin], admin);
    expect(response[0].joiningDate).toBe(single.joiningDate);
    expect(response[0].vacationBalance).toEqual({
      joiningDate: single.joiningDate,
      annualRemainingDays: single.annualRemainingDays,
      compensatoryRemainingDays: single.compensatoryRemainingDays,
    });
    expect(response[1].joiningDate).toBeNull();
    expect(response[1].vacationBalance).toBeNull();
    const self = await balances.withBalances([employee], employee);
    expect(self[0].joiningDate).toBe(single.joiningDate);
    expect(self[0].vacationBalance).toEqual(response[0].vacationBalance);
  });

  it("sets compensatory remaining days absolutely, records reductions, and is idempotent", async () => {
    await balances.setCompensatoryRemainingDays(employee.id, 3, admin);
    expect(
      (await balances.getBalance(employee.id, admin)).compensatoryRemainingDays,
    ).toBe(3);
    await Promise.all([
      balances.setCompensatoryRemainingDays(employee.id, 3, admin),
      balances.setCompensatoryRemainingDays(employee.id, 3, admin),
    ]);
    expect(
      (await balances.getBalance(employee.id, admin)).compensatoryRemainingDays,
    ).toBe(3);
    await balances.setCompensatoryRemainingDays(employee.id, 1, admin);
    expect(
      (await balances.getBalance(employee.id, admin)).compensatoryRemainingDays,
    ).toBe(1);
    const adjustments = await source.query(
      "SELECT days FROM vacation_compensatory_credits WHERE user_id=$1 ORDER BY created_at",
      [employee.id],
    );
    expect(adjustments.map((row) => Number(row.days))).toEqual([3, -2]);
    await balances.setCompensatoryRemainingDays(employee.id, 0, admin);
    expect(
      (await balances.getBalance(employee.id, admin)).compensatoryRemainingDays,
    ).toBe(0);
    await source.query(
      "DELETE FROM vacation_compensatory_credits WHERE user_id=$1",
      [employee.id],
    );
  });

  it("rolls back a balance adjustment if the combined user update fails", async () => {
    await expect(
      balances.setCompensatoryRemainingDays(employee.id, 5, admin, async () => {
        throw new Error("Profile update failed");
      }),
    ).rejects.toThrow("Profile update failed");
    expect(
      (await balances.getBalance(employee.id, admin)).compensatoryRemainingDays,
    ).toBe(0);
  });

  it("rejects balance changes without the individual grant permission", async () => {
    await expect(
      balances.setCompensatoryRemainingDays(employee.id, 4, employee),
    ).rejects.toThrow();
    for (const invalid of [-1, 366, NaN, Infinity, null, "3", 0.12345]) {
      await expect(
        balances.setCompensatoryRemainingDays(
          employee.id,
          invalid as number,
          admin,
        ),
      ).rejects.toThrow();
    }
  });

  it("updates profile and balance atomically through the existing PUT controller", async () => {
    const auth = new AuthService(
      source.getRepository(User),
      source.getRepository(Role),
      source.getRepository(Project),
      source.getRepository(Branch),
      {} as JwtService,
      {} as UsersService,
      {} as ProjectService,
      balances,
    );
    const controller = new AuthController(auth, {} as UsersService, balances);
    const response = await controller.updateUser(
      employee.id,
      { name: "Updated employee", compensatoryRemainingDays: 2 },
      { user: admin },
    );
    expect(response.vacationBalance.compensatoryRemainingDays).toBe(2);
    expect(
      (await source.getRepository(User).findOneByOrFail({ id: employee.id }))
        .name,
    ).toBe("Updated employee");
    await expect(
      controller.updateUser(
        employee.id,
        { username: admin.username, compensatoryRemainingDays: 9 },
        { user: admin },
      ),
    ).rejects.toThrow("Username already exists");
    expect(
      (await balances.getBalance(employee.id, admin)).compensatoryRemainingDays,
    ).toBe(2);
    await source.query(
      "DELETE FROM vacation_compensatory_credits WHERE user_id=$1",
      [employee.id],
    );
  });

  describe("joining date and annual remaining days in PUT /users/:id", () => {
    let target: User;
    let controller: AuthController;
    beforeEach(async () => {
      target = await source.getRepository(User).save({
        username: `balance-edit-${Date.now()}-${Math.random()}`,
        password: "unused",
        project_id: employee.project_id,
        branch,
      });
      const auth = new AuthService(
        source.getRepository(User),
        source.getRepository(Role),
        source.getRepository(Project),
        source.getRepository(Branch),
        {} as JwtService,
        {} as UsersService,
        {} as ProjectService,
        balances,
      );
      controller = new AuthController(auth, {} as UsersService, balances);
    });
    afterEach(async () => {
      await source.query(
        "DELETE FROM vacation_dates WHERE vacation_id IN (SELECT id FROM vacations WHERE user_id=$1)",
        [target.id],
      );
      await source.query("DELETE FROM vacations WHERE user_id=$1", [target.id]);
      await source.getRepository(User).delete(target.id);
    });
    it("sets all three fields in one request and keeps retries idempotent", async () => {
      const body = {
        joiningDate: "2026-07-01",
        annualRemainingDays: 14,
        compensatoryRemainingDays: 3,
      };
      const result = await controller.updateUser(target.id, body, {
        user: admin,
      });
      expect(result.vacationBalance).toEqual(body);
      expect(
        (await balances.withBalances([target], admin))[0].vacationBalance,
      ).toEqual(body);
      await controller.updateUser(target.id, body, { user: admin });
      expect(
        (await balances.getBalance(target.id, admin)).annualRemainingDays,
      ).toBe(14);
      const [count] = await source.query(
        "SELECT count(*) AS count FROM vacation_annual_adjustments WHERE user_id=$1",
        [target.id],
      );
      expect(Number(count.count)).toBe(1);
      const nextDay = await balances.getBalance(
        target.id,
        admin,
        new Date("2026-10-27T09:00:00Z"),
      );
      expect(nextDay.annualRemainingDays).toBeCloseTo(14 + 21 / 360, 3);
      const anniversary = await balances.getBalance(
        target.id,
        admin,
        new Date("2027-07-01T09:00:00Z"),
      );
      expect(anniversary.annualRemainingDays).toBe(0);
      expect(anniversary.compensatoryRemainingDays).toBe(3);
    });
    it("edits the joining date and annual balance with an existing pending request", async () => {
      await controller.updateUser(
        target.id,
        { joiningDate: "2026-07-01", annualRemainingDays: 10 },
        { user: admin },
      );
      await vacations.createVacation(
        {
          userId: target.id,
          branchId: branch.id,
          dates: ["2026-10-27"],
          reason: "annual_leave",
        },
        null,
        "en",
        target,
      );
      const result = await controller.updateUser(
        target.id,
        { joiningDate: "2026-08-01", annualRemainingDays: 5 },
        { user: admin },
      );
      expect(result.vacationBalance.joiningDate).toBe("2026-08-01");
      expect(result.vacationBalance.annualRemainingDays).toBe(5);
      expect(
        (await balances.getBalance(target.id, admin)).annualUsedOrReservedDays,
      ).toBe(1);
      await controller.updateUser(
        target.id,
        { annualRemainingDays: 0 },
        { user: admin },
      );
      expect(
        (await balances.getBalance(target.id, admin)).annualRemainingDays,
      ).toBe(0);
    });
    it("rolls back all balance fields when profile validation fails", async () => {
      await balances.setJoiningDate(target.id, "2026-07-01", admin);
      const before = await balances.getBalance(target.id, admin);
      await expect(
        controller.updateUser(
          target.id,
          {
            joiningDate: "2026-08-01",
            annualRemainingDays: 9,
            compensatoryRemainingDays: 4,
            username: admin.username,
          },
          { user: admin },
        ),
      ).rejects.toThrow("Username already exists");
      expect(await balances.getBalance(target.id, admin)).toEqual(before);
    });
    it("rejects annual edits without a joining date and invalid inputs", async () => {
      await expect(
        controller.updateUser(
          target.id,
          { annualRemainingDays: 9 },
          { user: admin },
        ),
      ).rejects.toThrow();
      for (const value of [-1, 22, NaN, null, "14", 0.12345]) {
        await expect(
          balances.updateUserBalance(
            target.id,
            { annualRemainingDays: value as number },
            admin,
          ),
        ).rejects.toThrow();
      }
      for (const joiningDate of ["2026-02-30", "bad-date", null]) {
        await expect(
          balances.updateUserBalance(target.id, { joiningDate }, admin),
        ).rejects.toThrow();
      }
      await expect(
        controller.updateUser(
          target.id,
          { joiningDate: "2026-07-01", annualRemainingDays: 4 },
          { user: target },
        ),
      ).rejects.toThrow();
    });
  });

  it("serializes simultaneous requests so only one can reserve the same remaining allowance", async () => {
    const result = await Promise.allSettled([
      request(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]),
      request(["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"]),
    ]);
    expect(result.filter((value) => value.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(result.filter((value) => value.status === "rejected")).toHaveLength(
      1,
    );
    const balance = await balances.getBalance(employee.id, employee);
    expect(balance.annualUsedOrReservedDays).toBe(4);
    expect(balance.pendingReservedDays).toBe(4);
  });

  it("does not double-deduct approvals and releases rejected requests", async () => {
    const vacation = await source
      .getRepository(Vacation)
      .findOneByOrFail({ user: { id: employee.id } });
    const before = await balances.getBalance(employee.id, employee);
    await vacations.updateDateStatus(
      vacation.id,
      { overall_status: "approved" },
      admin,
    );
    await vacations.updateDateStatus(
      vacation.id,
      { overall_status: "approved" },
      admin,
    );
    expect(
      (await balances.getBalance(employee.id, employee)).availableDays,
    ).toBe(before.availableDays);
    await vacations.updateDateStatus(
      vacation.id,
      { overall_status: "rejected" },
      admin,
    );
    expect(
      (await balances.getBalance(employee.id, employee))
        .annualUsedOrReservedDays,
    ).toBe(0);
  });

  it("does not reapprove a rejected request after another request reserved its dates", async () => {
    const rejected = await source.getRepository(Vacation).findOneByOrFail({
      user: { id: employee.id },
      overall_status: "rejected",
    });
    const dates = await source
      .getRepository(VacationDate)
      .findBy({ vacation: { id: rejected.id } });
    const replacement = await request(dates.map((date) => date.date));
    await expect(
      vacations.updateDateStatus(
        rejected.id,
        { overall_status: "approved" },
        admin,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await vacations.deleteVacation(replacement.id, admin);
  });

  it("persists compensatory grants and releases allocations when a vacation is deleted", async () => {
    await balances.grantCompensatory(employee.id, 3, "Additional work", admin);
    const before = await balances.getBalance(employee.id, employee);
    const vacation = await request(
      ["2026-11-20", "2026-11-21", "2026-11-22"],
      "compensatory_leave",
    );
    const reserved = await balances.getBalance(employee.id, employee);
    expect(reserved.compensatoryUsedOrReservedDays).toBeGreaterThan(0);
    await vacations.deleteVacation(vacation.id, admin);
    expect(
      (await balances.getBalance(employee.id, employee)).availableDays,
    ).toBe(before.availableDays);
  });

  it("denies other admins and super admins even when their role allows vacation updates", async () => {
    for (const role of ["admin", "super_admin"]) {
      const [savedRole] = await source.query(
        `INSERT INTO roles(id,name) VALUES(gen_random_uuid(),$1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
        [role],
      );
      const other = await source.getRepository(User).save({
        username: `unauthorized-${role}`,
        password: "unused",
        project_id: employee.project_id,
        role: { id: savedRole.id },
        canGrantCompensatoryLeave: false,
      });
      await expect(
        balances.grantCompensatory(employee.id, 1, "No permission", other),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        balances.setCompensatoryRemainingDays(employee.id, 1, other),
      ).rejects.toMatchObject({ status: 403 });
    }
  });

  it("renews only on the contract anniversary and preserves unused compensatory days", async () => {
    const balance = await balances.getBalance(
      employee.id,
      employee,
      new Date("2027-07-01T08:00:00Z"),
    );
    expect(balance.accruedDays).toBe(0);
    expect(balance.availableDays).toBe(3);
    expect(balance.periodStart).toBe("2027-07-01");
  });

  it("does not deduct weekly, sick, permission or historical compensatory leave from new credits", async () => {
    const before = await balances.getBalance(employee.id, employee);
    const created = [];
    for (const [index, reason] of [
      "weekend_vacation",
      "sick_leave",
      "permission_or_absence",
      "compensatory_leave",
    ].entries()) {
      const old = await source
        .getRepository(Vacation)
        .save({ user: employee, branch, reason, overall_status: "approved" });
      await source.getRepository(VacationDate).save({
        vacation: old,
        date: `2026-09-0${index + 1}`,
        created_at: new Date("2026-09-01T00:00:00Z"),
        updated_at: new Date("2026-09-01T00:00:00Z"),
      });
      created.push(old.id);
    }
    const after = await balances.getBalance(employee.id, employee);
    expect(after.annualRemainingDays).toBe(before.annualRemainingDays);
    expect(after.compensatoryRemainingDays).toBe(3);
    const weekly = await request(["2026-12-01"], "weekend_vacation");
    expect(
      (await balances.getBalance(employee.id, employee)).availableDays,
    ).toBe(before.availableDays);
    await vacations.updateDateStatus(
      weekly.id,
      { overall_status: "approved" },
      admin,
    );
    expect(
      (await balances.getBalance(employee.id, employee)).availableDays,
    ).toBe(before.availableDays);
    await vacations.deleteVacation(weekly.id, admin);
    for (const id of created)
      await source.getRepository(Vacation).softDelete(id);
  });

  it("refreshes anniversaries idempotently without changing compensatory credit", async () => {
    expect(
      await balances.refreshAnniversaries(new Date("2027-07-01T08:00:00Z")),
    ).toEqual({ refreshed: 1 });
    expect(
      await balances.refreshAnniversaries(new Date("2027-07-01T08:00:00Z")),
    ).toEqual({ refreshed: 1 });
    const balance = await balances.getBalance(
      employee.id,
      employee,
      new Date("2027-07-01T08:00:00Z"),
    );
    expect(balance.compensatoryGrantedDays).toBe(3);
    expect(balance.accruedDays).toBe(0);
  });

  it("keeps other projects able to request leave without a joining date or balance account", async () => {
    const otherProject = await source
      .getRepository(Project)
      .save({ name: "unaffected-project" });
    const otherBranch = await source
      .getRepository(Branch)
      .save({ name: "Other branch", project: otherProject });
    const otherEmployee = await source.getRepository(User).save({
      username: "other-employee",
      password: "unused",
      project_id: otherProject.id,
      branch: otherBranch,
    });
    const vacation = await vacations.createVacation(
      {
        userId: otherEmployee.id,
        branchId: otherBranch.id,
        dates: ["2026-11-01"],
        reason: "Existing behavior",
      },
      null,
      "en",
      otherEmployee,
    );
    expect(vacation.id).toBeDefined();
    await expect(
      balances.getBalance(otherEmployee.id, otherEmployee),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("imports all 66 workbook joining dates idempotently and rejects conflicting reruns", async () => {
    const sql = readFileSync(
      "database/20261026_import_taqnia_joining_dates.sql",
      "utf8",
    );
    const usernames = [
      ...sql.matchAll(/\('([^']+)', '\d{4}-\d{2}-\d{2}'::date\)/g),
    ].map((match) => match[1]);
    expect(usernames).toHaveLength(66);
    for (const username of usernames) {
      await source.getRepository(User).save({
        username,
        password: "unused",
        project_id: employee.project_id,
      });
    }
    await source.query(sql);
    await source.query(sql);
    const count = await source.query(
      `SELECT count(*)::int AS count FROM vacation_balance_accounts WHERE user_id <> $1`,
      [employee.id],
    );
    expect(count[0].count).toBe(66);
    await source.query(
      `UPDATE vacation_balance_accounts SET joining_date='2020-01-01' WHERE user_id=(SELECT id FROM users WHERE username=$1)`,
      [usernames[0]],
    );
    await expect(source.query(sql)).rejects.toThrow("conflicts with Book5");
    await source.query("ROLLBACK");
  });
});
