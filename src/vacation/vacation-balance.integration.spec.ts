import "reflect-metadata";
import { readFileSync } from "fs";
import { DataSource } from "typeorm";
import { User } from "entities/user.entity";
import { Project } from "entities/project.entity";
import { Branch } from "entities/branch.entity";
import { Vacation } from "entities/employee/vacation.entity";
import { VacationDate } from "entities/employee/vacation-date.entity";
import { Journey } from "entities/all_plans.entity";
import { VacationBalanceService } from "./vacation-balance.service";
import { VacationService } from "./vacation.service";

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
