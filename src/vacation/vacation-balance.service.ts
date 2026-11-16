import { VacationAnnualAdjustment } from "entities/employee/vacation-annual-adjustment.entity";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager, In } from "typeorm";
import { User } from "entities/user.entity";
import { Project } from "entities/project.entity";
import { VacationDate } from "entities/employee/vacation-date.entity";
import { VacationBalanceAccount } from "entities/employee/vacation-balance-account.entity";
import { VacationCompensatoryCredit } from "entities/employee/vacation-compensatory-credit.entity";
import {
  allocateVacationDays,
  balanceToday,
  contractPeriod,
  earnedAnnualDays,
  parseBalanceDate,
  roundDays,
} from "./vacation-balance.util";
import { vacationBalanceType } from "./vacation-balance-type";
import { qualifiesForAnnualAutoApproval } from "./annual-vacation-policy";

export interface UserVacationBalanceUpdate {
  joiningDate?: string;
  annualRemainingDays?: number;
  compensatoryRemainingDays?: number;
}

interface UsageRow {
  userId?: string;
  date: string;
  period: string | null;
  annual: string;
  compensatory: string;
  status: string;
}

@Injectable()
export class VacationBalanceService {
  constructor(private readonly dataSource: DataSource) {}

  private projectId(user: User): string | undefined {
    return user.project_id ?? user.project?.id ?? user.branch?.project?.id;
  }

  async employee(manager: EntityManager, userId: string): Promise<User> {
    const user = await manager.findOne(User, {
      where: { id: userId },
      relations: ["project", "branch", "branch.project"],
    });
    if (!user) throw new NotFoundException("Employee not found");
    return user;
  }

  async isEnabled(manager: EntityManager, user: User): Promise<boolean> {
    const projectId = this.projectId(user);
    if (!projectId) return false;
    const project = await manager.findOne(Project, {
      where: { id: projectId },
    });
    return project?.name?.trim().toLowerCase() === "taqnia";
  }

  async authorizeRequest(
    manager: EntityManager,
    user: User,
    actor: User | undefined,
    allowSelf: boolean,
  ) {
    if (!(await this.isEnabled(manager, user))) return;
    if (!actor?.id) {
      throw new ForbiddenException("Authenticated employee is required");
    }
    const requester = await manager.findOne(User, {
      where: { id: actor.id },
      relations: ["role", "project", "branch", "branch.project"],
    });
    if (requester?.role?.name === "super_admin") return;
    if (allowSelf && requester?.id === user.id) return;
    if (
      !requester ||
      !["admin", "supervisor"].includes(requester.role?.name) ||
      this.projectId(requester) !== this.projectId(user)
    ) {
      throw new ForbiddenException("Vacation request is outside your project");
    }
  }

  private async access(
    manager: EntityManager,
    user: User,
    actor: User,
    adminOnly = false,
  ) {
    if (!(await this.isEnabled(manager, user))) {
      throw new BadRequestException(
        "Vacation balances are enabled for Taqnia only",
      );
    }
    const requester = await manager.findOne(User, {
      where: { id: actor.id },
      relations: ["role", "project", "branch", "branch.project"],
    });
    if (!requester) throw new ForbiddenException();
    const role = requester.role?.name;
    if (role === "super_admin") return;
    if (!adminOnly && requester.id === user.id) return;
    if (
      role !== "admin" ||
      this.projectId(requester) !== this.projectId(user)
    ) {
      throw new ForbiddenException(
        "Only the employee or their project administrator can access this balance",
      );
    }
  }

  // Lock the employee before the account: all submission, status and credit
  // paths use the same lock order, including first-time account creation.
  async withEmployee<T>(
    userId: string,
    work: (manager: EntityManager, user: User) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const locked = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: "pessimistic_write" },
      });
      if (!locked) throw new NotFoundException("Employee not found");
      return work(manager, await this.employee(manager, userId));
    });
  }

  // Compensatory credits are admin-granted and never accrue from employment
  // time, so they do not require a registered joining date; annual accrual does.
  private static joinMessage =
    "Employment joining date is missing. Ask the Taqnia administrator to set it. / تاريخ الالتحاق بالعمل غير مسجل";

  private async obtainAccount(
    manager: EntityManager,
    user: User,
    today: string,
  ): Promise<VacationBalanceAccount | null> {
    const account = await manager.findOne(VacationBalanceAccount, {
      where: { userId: user.id },
      lock: { mode: "pessimistic_write" },
    });
    if (!account || account.projectId !== this.projectId(user)) return null;
    const period = contractPeriod(account.joiningDate, today);
    if (account.periodStart !== period.start) {
      account.periodStart = period.start;
      await manager.save(VacationBalanceAccount, account);
    }
    return account;
  }

  private async account(manager: EntityManager, user: User, today: string) {
    const account = await this.obtainAccount(manager, user, today);
    if (!account) {
      throw new BadRequestException(VacationBalanceService.joinMessage);
    }
    return account;
  }

  private async usage(
    manager: EntityManager,
    userId: string | string[],
    excludeVacationId?: string,
  ): Promise<UsageRow[]> {
    const rows: (UsageRow & {
      reason: string;
      compensatoryTracked: boolean;
    })[] = await manager.query(
      `SELECT v.user_id AS "userId", d.date::text AS date, d.balance_period_start::text AS period,
        COALESCE(d.annual_balance_days, 1)::text AS annual,
        COALESCE(d.compensatory_balance_days, 0)::text AS compensatory,
        v.overall_status::text AS status, v.reason,
        EXISTS (
          SELECT 1 FROM vacation_compensatory_credits c
          WHERE c.user_id=v.user_id AND c.deleted_at IS NULL
            AND (c.created_at <= d.created_at OR
              (d.compensatory_balance_days IS NOT NULL AND c.created_at <= d.updated_at))
        ) AS "compensatoryTracked"
      FROM vacation_dates d JOIN vacations v ON v.id = d.vacation_id
      WHERE v.user_id = ANY($1::uuid[]) AND v.deleted_at IS NULL AND d.deleted_at IS NULL
        AND v.overall_status IN ('pending', 'approved')
        AND ($2::uuid IS NULL OR v.id <> $2::uuid)`,
      [Array.isArray(userId) ? userId : [userId], excludeVacationId ?? null],
    );
    return rows.map((row) => {
      const type = vacationBalanceType(row.reason);
      return {
        ...row,
        annual: type === "annual" ? "1" : "0",
        compensatory:
          type === "compensatory" && row.compensatoryTracked ? "1" : "0",
      };
    });
  }

  private async snapshot(
    manager: EntityManager,
    user: User,
    today: string,
    excludeVacationId?: string,
  ) {
    const account = await this.obtainAccount(manager, user, today);
    const rows = await this.usage(manager, user.id, excludeVacationId);
    const credits: { days: string }[] = await manager.query(
      `SELECT COALESCE(SUM(days),0)::text AS days FROM vacation_compensatory_credits WHERE user_id = $1 AND deleted_at IS NULL`,
      [user.id],
    );
    const annualAdjustments: { days: string }[] = account
      ? await manager.query(
          `SELECT COALESCE(SUM(days),0)::text AS days FROM vacation_annual_adjustments
       WHERE user_id=$1 AND period_start=$2 AND deleted_at IS NULL`,
          [user.id, contractPeriod(account.joiningDate, today).start],
        )
      : [];
    return this.calculateSnapshot(
      account,
      user.id,
      today,
      rows,
      Number(credits[0]?.days ?? 0),
      Number(annualAdjustments[0]?.days ?? 0),
    );
  }

  // When no balance account exists yet (no joining date), only compensatory
  // fields are meaningful; annual accrual stays zero until a date is set.
  private calculateSnapshot(
    account: VacationBalanceAccount | null,
    userId: string,
    today: string,
    rows: UsageRow[],
    compensatoryGranted: number,
    annualAdjustmentDays = 0,
  ) {
    const period = account ? contractPeriod(account.joiningDate, today) : null;
    const inCurrentPeriod = account
      ? (row: UsageRow) =>
          row.date >= account.joiningDate &&
          contractPeriod(account.joiningDate, row.date).start === period.start
      : () => false;
    const periodRows = rows.filter(inCurrentPeriod);
    const sum = (values: UsageRow[], key: "annual" | "compensatory") =>
      roundDays(values.reduce((total, row) => total + Number(row[key]), 0));
    const accrued = account ? earnedAnnualDays(account.joiningDate, today) : 0;
    const annualUsed = sum(periodRows, "annual");
    const compensatoryUsed = sum(rows, "compensatory");
    // Keep historical debt visible: imported/existing leave can exceed
    // today's accrual and must not disappear when credits are granted.
    const annualRemaining = roundDays(
      accrued + annualAdjustmentDays - annualUsed,
    );
    const compensatoryRemaining = Math.max(
      0,
      roundDays(compensatoryGranted - compensatoryUsed),
    );
    return {
      userId,
      joiningDate: account?.joiningDate ?? null,
      periodStart: period?.start ?? null,
      periodEndExclusive: period?.end ?? null,
      asOf: today,
      annualEntitlementDays: 21,
      accruedDays: accrued,
      annualUsedOrReservedDays: annualUsed,
      annualRemainingDays: annualRemaining,
      compensatoryGrantedDays: compensatoryGranted,
      compensatoryUsedOrReservedDays: compensatoryUsed,
      compensatoryRemainingDays: compensatoryRemaining,
      pendingReservedDays: roundDays(
        rows
          .filter((row) => row.status === "pending")
          .reduce(
            (total, row) =>
              total +
              Number(row.compensatory) +
              (inCurrentPeriod(row) ? Number(row.annual) : 0),
            0,
          ),
      ),
      availableDays: Math.max(
        0,
        roundDays(Math.max(0, annualRemaining) + compensatoryRemaining),
      ),
    };
  }

  summary(balance: {
    joiningDate: string | null;
    annualRemainingDays: number;
    compensatoryRemainingDays: number;
  }) {
    return {
      joiningDate: balance.joiningDate,
      annualRemainingDays: balance.annualRemainingDays,
      compensatoryRemainingDays: balance.compensatoryRemainingDays,
    };
  }

  // Enrich an existing authorized response; do not grant extra balance access.
  // All page balances share one consistent database snapshot, without write locks.
  async withBalances<T extends { id: string }>(
    users: T[],
    actor: User,
    now = new Date(),
  ) {
    type Balance = ReturnType<VacationBalanceService["calculateSnapshot"]>;
    const balances = new Map<string, Balance>();
    const joiningDates = new Map<string, string>();
    if (users.length && actor?.id) {
      await this.dataSource.transaction("REPEATABLE READ", async (manager) => {
        const requester = await manager.findOne(User, {
          where: { id: actor.id },
          relations: ["role", "project", "branch", "branch.project"],
        });
        if (!requester) return;
        const employees = await manager.find(User, {
          where: { id: In(users.map((user) => user.id)) },
          relations: ["project", "branch", "branch.project"],
        });
        const allowed = employees.filter(
          (employee) =>
            requester.role?.name === "super_admin" ||
            requester.id === employee.id ||
            (requester.role?.name === "admin" &&
              this.projectId(requester) === this.projectId(employee)),
        );
        if (!allowed.length) return;
        const employeeProjects = new Map(
          allowed.map((user) => [user.id, this.projectId(user)]),
        );
        const allAccounts = await manager.find(VacationBalanceAccount, {
          where: { userId: In(allowed.map((user) => user.id)) },
          relations: ["project"],
        });
        for (const account of allAccounts) {
          if (account.projectId === employeeProjects.get(account.userId)) {
            joiningDates.set(account.userId, account.joiningDate);
          }
        }
        const accounts = allAccounts.filter(
          (account) =>
            account.project?.name?.trim().toLowerCase() === "taqnia" &&
            account.projectId === employeeProjects.get(account.userId),
        );
        const accountIds = new Set(accounts.map((account) => account.userId));
        const withoutAccount = allowed.filter(
          (user) =>
            !accountIds.has(user.id) &&
            (user.project?.name ?? user.branch?.project?.name)
              ?.trim()
              .toLowerCase() === "taqnia",
        );
        const ids = [...accountIds, ...withoutAccount.map((user) => user.id)];
        if (!ids.length) return;
        const usage = await this.usage(manager, ids);
        const credits: { userId: string; days: string }[] = await manager.query(
          `SELECT user_id AS "userId", SUM(days)::text AS days
           FROM vacation_compensatory_credits
           WHERE user_id = ANY($1::uuid[]) AND deleted_at IS NULL GROUP BY user_id`,
          [ids],
        );
        const creditsByUser = new Map(
          credits.map((credit) => [credit.userId, Number(credit.days)]),
        );
        const annualRows: { userId: string; period: string; days: string }[] =
          await manager.query(
            `SELECT user_id AS "userId", period_start::text AS period, SUM(days)::text AS days
           FROM vacation_annual_adjustments WHERE user_id=ANY($1::uuid[]) AND deleted_at IS NULL
           GROUP BY user_id, period_start`,
            [ids],
          );
        const annualByUserPeriod = new Map(
          annualRows.map((row) => [
            `${row.userId}:${row.period}`,
            Number(row.days),
          ]),
        );
        const usageByUser = new Map<string, UsageRow[]>();
        for (const row of usage) {
          const rows = usageByUser.get(row.userId) ?? [];
          rows.push(row);
          usageByUser.set(row.userId, rows);
        }
        const today = balanceToday(now);
        for (const user of withoutAccount) {
          balances.set(
            user.id,
            this.calculateSnapshot(
              null,
              user.id,
              today,
              usageByUser.get(user.id) ?? [],
              creditsByUser.get(user.id) ?? 0,
            ),
          );
        }
        for (const account of accounts) {
          balances.set(
            account.userId,
            this.calculateSnapshot(
              account,
              account.userId,
              today,
              usageByUser.get(account.userId) ?? [],
              creditsByUser.get(account.userId) ?? 0,
              annualByUserPeriod.get(
                `${account.userId}:${contractPeriod(account.joiningDate, today).start}`,
              ) ?? 0,
            ),
          );
        }
      });
    }
    return users.map((user) => ({
      ...user,
      joiningDate:
        joiningDates.get(user.id) ?? (user as any).joiningDate ?? null,
      vacationBalance: balances.has(user.id)
        ? this.summary(balances.get(user.id))
        : null,
    }));
  }

  async getBalance(userId: string, actor: User, now = new Date()) {
    return this.withEmployee(userId, async (manager, user) => {
      await this.access(manager, user, actor);
      return this.snapshot(manager, user, balanceToday(now));
    });
  }

  async setJoiningDate(userId: string, joiningDate: string, actor: User) {
    return this.withEmployee(userId, async (manager, user) => {
      await this.access(manager, user, actor, true);
      await this.saveJoiningDate(manager, user, joiningDate);
      return this.snapshot(manager, user, balanceToday());
    });
  }

  private async saveJoiningDate(
    manager: EntityManager,
    user: User,
    joiningDate: string,
  ) {
    try {
      parseBalanceDate(joiningDate);
    } catch {
      throw new BadRequestException("Invalid joining date; use YYYY-MM-DD");
    }
    await manager.save(VacationBalanceAccount, {
      userId: user.id,
      projectId: this.projectId(user),
      joiningDate,
      periodStart: contractPeriod(joiningDate, balanceToday()).start,
    });
  }

  async grantCompensatory(
    userId: string,
    days: number,
    reason: string,
    actor: User,
  ) {
    if (
      !Number.isFinite(days) ||
      days <= 0 ||
      days > 365 ||
      roundDays(days) !== days ||
      !reason?.trim()
    ) {
      throw new BadRequestException(
        "A positive number of days (maximum 365) and a reason are required",
      );
    }
    return this.withEmployee(userId, async (manager, user) => {
      await this.access(manager, user, actor, true);
      await this.authorizeCompensatoryGrant(manager, actor);
      await manager.save(VacationCompensatoryCredit, {
        userId,
        days: String(days),
        reason: reason.trim(),
        grantedById: actor.id,
      });
      return this.snapshot(manager, user, balanceToday());
    });
  }

  async setCompensatoryRemainingDays<T = undefined>(
    userId: string,
    days: number,
    actor: User,
    updateUser?: (manager: EntityManager) => Promise<T>,
  ) {
    return this.updateUserBalance(
      userId,
      { compensatoryRemainingDays: days },
      actor,
      updateUser,
    );
  }

  private validateBalanceUpdateInput(values: UserVacationBalanceUpdate) {
    if (values.joiningDate !== undefined) {
      try {
        parseBalanceDate(values.joiningDate);
      } catch {
        throw new BadRequestException("Invalid joining date; use YYYY-MM-DD");
      }
    }
    for (const [value, maximum, label] of [
      [values.annualRemainingDays, 21, "Annual"],
      [values.compensatoryRemainingDays, 365, "Compensatory"],
    ] as const) {
      if (
        value !== undefined &&
        (typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > maximum ||
          roundDays(value) !== value)
      ) {
        throw new BadRequestException(
          `${label} remaining days must be between 0 and ${maximum}, with at most four decimal places`,
        );
      }
    }
  }

  private async applyBalanceUpdates(
    manager: EntityManager,
    user: User,
    values: UserVacationBalanceUpdate,
    actor: User,
    action: "create" | "update",
  ) {
    if (
      values.annualRemainingDays !== undefined ||
      values.compensatoryRemainingDays !== undefined
    ) {
      await this.authorizeCompensatoryGrant(manager, actor);
    }
    if (values.joiningDate !== undefined) {
      await this.saveJoiningDate(manager, user, values.joiningDate);
    }
    const current = await this.snapshot(manager, user, balanceToday());
    if (values.annualRemainingDays !== undefined) {
      if (!current.joiningDate && values.annualRemainingDays !== 0) {
        throw new BadRequestException(VacationBalanceService.joinMessage);
      }
      const adjustment = roundDays(
        values.annualRemainingDays - current.annualRemainingDays,
      );
      if (adjustment !== 0) {
        await manager.save(VacationAnnualAdjustment, {
          userId: user.id,
          periodStart: current.periodStart,
          days: String(adjustment),
          grantedById: actor.id,
          reason: `Annual remaining balance set to ${values.annualRemainingDays} days via user ${action === "create" ? "creation" : "update"}`,
        });
      }
    }
    if (values.compensatoryRemainingDays !== undefined) {
      const adjustment = roundDays(
        values.compensatoryRemainingDays -
          (current.compensatoryGrantedDays -
            current.compensatoryUsedOrReservedDays),
      );
      if (adjustment !== 0) {
        await manager.save(VacationCompensatoryCredit, {
          userId: user.id,
          days: String(adjustment),
          grantedById: actor.id,
          reason: `Compensatory remaining balance set to ${values.compensatoryRemainingDays} days via user ${action === "create" ? "creation" : "update"}`,
        });
      }
    }
  }

  async createUserBalance<T extends { id: string }>(
    values: UserVacationBalanceUpdate,
    actor: User,
    createUser: (manager: EntityManager) => Promise<T>,
  ): Promise<{
    user: T;
    vacationBalance: ReturnType<VacationBalanceService["summary"]>;
  }> {
    this.validateBalanceUpdateInput(values);
    return this.dataSource.transaction(async (manager) => {
      if (
        values.annualRemainingDays !== undefined ||
        values.compensatoryRemainingDays !== undefined
      ) {
        await this.authorizeCompensatoryGrant(manager, actor);
      }
      const createdUser = await createUser(manager);
      const user = await this.employee(manager, createdUser.id);
      await this.access(manager, user, actor, true);
      await this.applyBalanceUpdates(manager, user, values, actor, "create");
      return {
        user: createdUser,
        vacationBalance: this.summary(
          await this.snapshot(manager, user, balanceToday()),
        ),
      };
    });
  }

  async validateImportedBalance(
    userId: string,
    values: UserVacationBalanceUpdate,
    actor: User,
  ) {
    this.validateBalanceUpdateInput(values);
    const manager = this.dataSource.manager;
    const user = await this.employee(manager, userId);
    await this.access(manager, user, actor, true);
    if (
      values.annualRemainingDays !== undefined ||
      values.compensatoryRemainingDays !== undefined
    ) {
      await this.authorizeCompensatoryGrant(manager, actor);
    }
    const account = await manager.findOne(VacationBalanceAccount, {
      where: { userId },
    });
    if (
      values.annualRemainingDays !== undefined &&
      values.annualRemainingDays !== 0 &&
      !values.joiningDate &&
      !account
    ) {
      throw new BadRequestException(VacationBalanceService.joinMessage);
    }
  }

  async updateUserBalance<T = undefined>(
    userId: string,
    values: UserVacationBalanceUpdate,
    actor: User,
    updateUser?: (manager: EntityManager) => Promise<T>,
  ) {
    this.validateBalanceUpdateInput(values);
    return this.withEmployee(userId, async (manager, user) => {
      await this.access(manager, user, actor, true);
      await this.applyBalanceUpdates(manager, user, values, actor, "update");
      const updatedUser = updateUser ? await updateUser(manager) : undefined;
      return {
        user: updatedUser,
        vacationBalance: this.summary(
          await this.snapshot(manager, user, balanceToday()),
        ),
      };
    });
  }

  private async authorizeCompensatoryGrant(
    manager: EntityManager,
    actor: User,
  ) {
    const granter = await manager.findOne(User, {
      where: { id: actor.id, is_active: true },
    });
    if (granter?.canGrantCompensatoryLeave !== true) {
      throw new ForbiddenException(
        "You do not have permission to add compensatory vacation days / ليس لديك صلاحية إضافة رصيد إجازة تعويضية",
      );
    }
  }

  async allocate(
    manager: EntityManager,
    user: User,
    dates: string[],
    lang = "en",
    excludeVacationId?: string,
    reason = "annual_leave",
  ): Promise<Partial<VacationDate>[]> {
    if (!(await this.isEnabled(manager, user))) return dates.map(() => ({}));
    const type = vacationBalanceType(reason);
    if (type === "none") return dates.map(() => ({}));
    const today = balanceToday();
    const balance = await this.snapshot(
      manager,
      user,
      today,
      excludeVacationId,
    );
    if (!balance.joiningDate) {
      if (type === "annual") {
        throw new BadRequestException(VacationBalanceService.joinMessage);
      }
    } else if (dates.some((date) => date < balance.joiningDate)) {
      throw new BadRequestException(
        "Vacation cannot precede the employment joining date",
      );
    }
    let annual =
      type === "annual" ? Math.max(0, balance.annualRemainingDays) : 0;
    let compensatory =
      type === "compensatory" ? balance.compensatoryRemainingDays : 0;
    const selectedAvailable = type === "annual" ? annual : compensatory;
    const annualThresholdAllowance =
      qualifiesForAnnualAutoApproval(dates.length, annual, reason) &&
      dates.every(
        (date) =>
          contractPeriod(balance.joiningDate, date).start ===
          balance.periodStart,
      );
    const results: Partial<VacationDate>[] = [];
    for (const date of dates) {
      // Without a joining date there is no contract period: everything is
      // compensated from admin credits and no period is recorded.
      const period = balance.joiningDate
        ? contractPeriod(balance.joiningDate, date)
        : null;
      const eligibleAnnual = period?.start === balance.periodStart ? annual : 0;
      if (
        !annualThresholdAllowance &&
        roundDays(eligibleAnnual + compensatory) < 1
      ) {
        const available = Math.floor(selectedAvailable * 100) / 100;
        throw new BadRequestException({
          code: "INSUFFICIENT_VACATION_BALANCE",
          availableDays: selectedAvailable,
          balanceType: type,
          message: lang.toLowerCase().startsWith("ar")
            ? `رصيد الإجازات المتاح لديك هو ${available} يومًا`
            : `You only have ${available} vacation days available`,
          periodStart: period?.start ?? null,
        });
      }
      const allocation = annualThresholdAllowance
        ? { annualDays: 1, compensatoryDays: 0 }
        : allocateVacationDays(1, eligibleAnnual, compensatory)[0];
      annual = roundDays(annual - allocation.annualDays);
      compensatory = roundDays(compensatory - allocation.compensatoryDays);
      results.push({
        balancePeriodStart: period?.start ?? null,
        annualBalanceDays: String(allocation.annualDays),
        compensatoryBalanceDays: String(allocation.compensatoryDays),
      });
    }
    return results;
  }

  async refreshAnniversaries(now = new Date()) {
    const today = balanceToday(now);
    // Accounts are a bounded selection of Taqnia employees, never all tenants.
    const accounts = await this.dataSource
      .getRepository(VacationBalanceAccount)
      .createQueryBuilder("account")
      .innerJoin("account.user", "employee")
      .innerJoin("account.project", "project")
      .where("employee.deleted_at IS NULL")
      .andWhere("LOWER(TRIM(project.name)) = :projectName", {
        projectName: "taqnia",
      })
      .select(["account.userId"])
      .getMany();
    let refreshed = 0;
    for (const account of accounts) {
      await this.withEmployee(account.userId, async (manager, user) => {
        if (await this.isEnabled(manager, user)) {
          await this.account(manager, user, today);
          refreshed++;
        }
      });
    }
    return { refreshed };
  }
}
