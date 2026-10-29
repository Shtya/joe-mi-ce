import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
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

interface UsageRow {
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
    if (!actor?.id)
      throw new ForbiddenException("Authenticated employee is required");
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
    )
      throw new ForbiddenException("Vacation request is outside your project");
  }

  private async access(
    manager: EntityManager,
    user: User,
    actor: User,
    adminOnly = false,
  ) {
    if (!(await this.isEnabled(manager, user)))
      throw new BadRequestException(
        "Vacation balances are enabled for Taqnia only",
      );
    const requester = await manager.findOne(User, {
      where: { id: actor.id },
      relations: ["role", "project", "branch", "branch.project"],
    });
    if (!requester) throw new ForbiddenException();
    const role = requester.role?.name;
    if (role === "super_admin") return;
    if (!adminOnly && requester.id === user.id) return;
    if (role !== "admin" || this.projectId(requester) !== this.projectId(user))
      throw new ForbiddenException(
        "Only the employee or their project administrator can access this balance",
      );
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

  private async account(manager: EntityManager, user: User, today: string) {
    const account = await manager.findOne(VacationBalanceAccount, {
      where: { userId: user.id },
      lock: { mode: "pessimistic_write" },
    });
    if (!account || account.projectId !== this.projectId(user))
      throw new BadRequestException(
        "Employment joining date is missing. Ask the Taqnia administrator to set it. / تاريخ الالتحاق بالعمل غير مسجل",
      );
    const period = contractPeriod(account.joiningDate, today);
    if (account.periodStart !== period.start) {
      account.periodStart = period.start;
      await manager.save(VacationBalanceAccount, account);
    }
    return account;
  }

  private async usage(
    manager: EntityManager,
    userId: string,
    excludeVacationId?: string,
  ): Promise<UsageRow[]> {
    const rows: (UsageRow & {
      reason: string;
      compensatoryTracked: boolean;
    })[] = await manager.query(
      `SELECT d.date::text AS date, d.balance_period_start::text AS period,
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
      WHERE v.user_id = $1 AND v.deleted_at IS NULL AND d.deleted_at IS NULL
        AND v.overall_status IN ('pending', 'approved')
        AND ($2::uuid IS NULL OR v.id <> $2::uuid)`,
      [userId, excludeVacationId ?? null],
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
    const account = await this.account(manager, user, today);
    const period = contractPeriod(account.joiningDate, today);
    const rows = await this.usage(manager, user.id, excludeVacationId);
    const credits: { days: string }[] = await manager.query(
      `SELECT COALESCE(SUM(days),0)::text AS days FROM vacation_compensatory_credits WHERE user_id = $1 AND deleted_at IS NULL`,
      [user.id],
    );
    const inCurrentPeriod = (row: UsageRow) =>
      row.date >= account.joiningDate &&
      (row.period ?? contractPeriod(account.joiningDate, row.date).start) ===
        period.start;
    const periodRows = rows.filter(inCurrentPeriod);
    const sum = (values: UsageRow[], key: "annual" | "compensatory") =>
      roundDays(values.reduce((total, row) => total + Number(row[key]), 0));
    const accrued = earnedAnnualDays(account.joiningDate, today);
    const annualUsed = sum(periodRows, "annual");
    const compensatoryUsed = sum(rows, "compensatory");
    const compensatoryGranted = Number(credits[0]?.days ?? 0);
    // Keep historical debt visible: imported/existing leave can exceed
    // today's accrual and must not disappear when credits are granted.
    const annualRemaining = roundDays(accrued - annualUsed);
    const compensatoryRemaining = Math.max(
      0,
      roundDays(compensatoryGranted - compensatoryUsed),
    );
    return {
      userId: user.id,
      joiningDate: account.joiningDate,
      periodStart: period.start,
      periodEndExclusive: period.end,
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

  async getBalance(userId: string, actor: User, now = new Date()) {
    return this.withEmployee(userId, async (manager, user) => {
      await this.access(manager, user, actor);
      return this.snapshot(manager, user, balanceToday(now));
    });
  }

  async setJoiningDate(userId: string, joiningDate: string, actor: User) {
    try {
      parseBalanceDate(joiningDate);
    } catch {
      throw new BadRequestException("Invalid joining date");
    }
    return this.withEmployee(userId, async (manager, user) => {
      await this.access(manager, user, actor, true);
      const existing = await manager.findOne(VacationBalanceAccount, {
        where: { userId },
      });
      if (existing && existing.joiningDate !== joiningDate) {
        const allocated: { count: string }[] = await manager.query(
          `SELECT count(*)::text AS count FROM vacation_dates d JOIN vacations v ON v.id=d.vacation_id WHERE v.user_id=$1 AND d.balance_period_start IS NOT NULL AND v.deleted_at IS NULL AND d.deleted_at IS NULL AND v.overall_status IN ('pending','approved')`,
          [userId],
        );
        if (Number(allocated[0]?.count) > 0)
          throw new BadRequestException(
            "Joining date cannot change while allocated vacation requests exist",
          );
      }
      await manager.save(VacationBalanceAccount, {
        userId,
        projectId: this.projectId(user),
        joiningDate,
        periodStart: contractPeriod(joiningDate, balanceToday()).start,
      });
      return this.snapshot(manager, user, balanceToday());
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
    )
      throw new BadRequestException(
        "A positive number of days (maximum 365) and a reason are required",
      );
    return this.withEmployee(userId, async (manager, user) => {
      await this.access(manager, user, actor, true);
      const granter = await manager.findOne(User, {
        where: { id: actor.id, is_active: true },
      });
      if (granter?.canGrantCompensatoryLeave !== true) {
        throw new ForbiddenException(
          "You do not have permission to add compensatory vacation days / ليس لديك صلاحية إضافة رصيد إجازة تعويضية",
        );
      }
      await this.account(manager, user, balanceToday());
      await manager.save(VacationCompensatoryCredit, {
        userId,
        days: String(days),
        reason: reason.trim(),
        grantedById: actor.id,
      });
      return this.snapshot(manager, user, balanceToday());
    });
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
    if (dates.some((date) => date < balance.joiningDate))
      throw new BadRequestException(
        "Vacation cannot precede the employment joining date",
      );
    let annual =
      type === "annual" ? Math.max(0, balance.annualRemainingDays) : 0;
    let compensatory =
      type === "compensatory" ? balance.compensatoryRemainingDays : 0;
    const selectedAvailable = type === "annual" ? annual : compensatory;
    const results: Partial<VacationDate>[] = [];
    for (const date of dates) {
      const period = contractPeriod(balance.joiningDate, date);
      const eligibleAnnual = period.start === balance.periodStart ? annual : 0;
      if (roundDays(eligibleAnnual + compensatory) < 1) {
        const available = Math.floor(selectedAvailable * 100) / 100;
        throw new BadRequestException({
          code: "INSUFFICIENT_VACATION_BALANCE",
          availableDays: selectedAvailable,
          balanceType: type,
          message: lang.toLowerCase().startsWith("ar")
            ? `رصيد الإجازات المتاح لديك هو ${available} يومًا`
            : `You only have ${available} vacation days available`,
          periodStart: period.start,
        });
      }
      const allocation = allocateVacationDays(
        1,
        eligibleAnnual,
        compensatory,
      )[0];
      annual = roundDays(annual - allocation.annualDays);
      compensatory = roundDays(compensatory - allocation.compensatoryDays);
      results.push({
        balancePeriodStart: period.start,
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
