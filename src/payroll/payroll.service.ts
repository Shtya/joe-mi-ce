import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  SalaryImportDto,
  ReplacePayrollViolationRulesDto,
} from "dto/payroll.dto";
import { CheckIn, Journey } from "entities/all_plans.entity";
import { VacationDate } from "entities/employee/vacation-date.entity";
import { Vacation } from "entities/employee/vacation.entity";
import { EmployeeSalary } from "entities/payroll/employee-salary.entity";
import { PayrollLineViolation } from "entities/payroll/payroll-line-violation.entity";
import { PayrollLine } from "entities/payroll/payroll-line.entity";
import { PayrollPeriod } from "entities/payroll/payroll-period.entity";
import { PayrollViolationRule } from "entities/payroll/payroll-violation-rule.entity";
import { PayrollViolation } from "entities/payroll/payroll-violation.entity";
import { Project } from "entities/project.entity";
import { User } from "entities/user.entity";
import { ERole } from "enums/Role.enum";
import { EPermission } from "enums/Permissions.enum";
import {
  Between,
  DataSource,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from "typeorm";
import * as XLSX from "xlsx";
import * as ExcelJS from "exceljs";
import { DEFAULT_VIOLATION_RULES } from "./default-violation-policy";
import {
  calculatePayrollViolation,
  calculateShiftVariance,
  roundMoney,
} from "./payroll-calculator";
import {
  DefaultViolationRule,
  PayrollPeriodStatus,
  PayrollViolationEventType,
} from "./payroll.types";

interface SalaryImportRow {
  User: unknown;
  Salary: unknown;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(EmployeeSalary)
    private readonly salaryRepo: Repository<EmployeeSalary>,
    @InjectRepository(PayrollViolationRule)
    private readonly ruleRepo: Repository<PayrollViolationRule>,
    @InjectRepository(PayrollViolation)
    private readonly violationRepo: Repository<PayrollViolation>,
    @InjectRepository(PayrollPeriod)
    private readonly periodRepo: Repository<PayrollPeriod>,
    @InjectRepository(PayrollLine)
    private readonly lineRepo: Repository<PayrollLine>,
    @InjectRepository(PayrollLineViolation)
    private readonly lineViolationRepo: Repository<PayrollLineViolation>,
    @InjectRepository(Journey)
    private readonly journeyRepo: Repository<Journey>,
    @InjectRepository(CheckIn)
    private readonly checkInRepo: Repository<CheckIn>,
    @InjectRepository(Vacation)
    private readonly vacationRepo: Repository<Vacation>,
    @InjectRepository(VacationDate)
    private readonly vacationDateRepo: Repository<VacationDate>,
  ) {}

  async getSalaryImportTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet5");
    sheet.columns = [
      { header: "No", key: "no", width: 10 },
      { header: "Name", key: "name", width: 30 },
      { header: "User", key: "user", width: 18 },
      { header: "Salary", key: "salary", width: 16 },
    ];
    sheet.addRow({
      no: 1,
      name: "Existing employee name",
      user: "AEC-001",
      salary: 4500,
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF238B8B" },
    };
    sheet.getCell("D2").numFmt = "#,##0.00";
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private assertProjectPayrollAccess(
    actor: User,
    projectId: string,
    permission: EPermission,
  ): void {
    if (actor?.role?.name === ERole.SUPER_ADMIN) return;
    if (
      actor?.role?.name !== ERole.PROJECT_ADMIN ||
      actor?.project_id !== projectId ||
      !actor?.role?.hasPermission(permission)
    ) {
      throw new ForbiddenException(
        "You do not have payroll access for this project",
      );
    }
  }

  private async requireProject(projectId: string): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  async enableProjectPayroll(projectId: string, enabled: boolean, actor: User) {
    this.assertProjectPayrollAccess(
      actor,
      projectId,
      EPermission.PAYROLL_MANAGE,
    );
    return this.dataSource.transaction(async (manager) => {
      const project = await manager.findOne(Project, {
        where: { id: projectId },
      });
      if (!project) throw new NotFoundException("Project not found");
      project.payrollEnabled = enabled;
      await manager.save(project);
      if (
        enabled &&
        (await manager.count(PayrollViolationRule, {
          where: { projectId },
        })) === 0
      ) {
        await manager.save(
          PayrollViolationRule,
          DEFAULT_VIOLATION_RULES.map((rule, index) =>
            manager.create(PayrollViolationRule, {
              projectId,
              ruleKey: rule.ruleKey,
              version: 1,
              enabled: true,
              sortOrder: index + 1,
              eventType: rule.eventType as PayrollViolationEventType,
              minimumMinutes: rule.minimumMinutes,
              maximumMinutes: rule.maximumMinutes,
              blocksOtherWorkers: rule.blocksOtherWorkers,
              actions: [...rule.actions],
              updatedById: actor.id,
            }),
          ),
        );
      }
      return { projectId, payrollEnabled: enabled };
    });
  }

  async getViolationRules(projectId: string, actor: User) {
    this.assertProjectPayrollAccess(actor, projectId, EPermission.PAYROLL_READ);
    await this.requireProject(projectId);
    return this.ruleRepo.find({
      where: { projectId },
      order: { sortOrder: "ASC" },
    });
  }

  async replaceViolationRules(
    projectId: string,
    dto: ReplacePayrollViolationRulesDto,
    actor: User,
  ) {
    this.assertProjectPayrollAccess(
      actor,
      projectId,
      EPermission.PAYROLL_MANAGE,
    );
    await this.requireProject(projectId);
    const keys = dto.rules.map((rule) => rule.ruleKey);
    if (new Set(keys).size !== keys.length)
      throw new BadRequestException("Rule keys must be unique");
    for (const rule of dto.rules) {
      if (
        rule.maximumMinutes !== null &&
        rule.maximumMinutes !== undefined &&
        rule.maximumMinutes < rule.minimumMinutes
      ) {
        throw new BadRequestException(
          `Invalid minute range for ${rule.ruleKey}`,
        );
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const current = await manager.find(PayrollViolationRule, {
        where: { projectId },
      });
      const versions = new Map(
        current.map((rule) => [rule.ruleKey, rule.version]),
      );
      if (current.length)
        await manager.softRemove(PayrollViolationRule, current);
      return manager.save(
        PayrollViolationRule,
        dto.rules.map((rule) =>
          manager.create(PayrollViolationRule, {
            ...rule,
            projectId,
            eventType: rule.eventType as PayrollViolationEventType,
            version: (versions.get(rule.ruleKey) ?? 0) + 1,
            updatedById: actor.id,
          }),
        ),
      );
    });
  }

  async importSalaries(
    projectId: string,
    file: Express.Multer.File,
    actor: User,
    dto: SalaryImportDto = {},
  ) {
    this.assertProjectPayrollAccess(
      actor,
      projectId,
      EPermission.PAYROLL_MANAGE,
    );
    const project = await this.requireProject(projectId);
    if (!project.payrollEnabled)
      throw new ConflictException("Payroll is not enabled for this project");
    if (!file?.buffer?.length)
      throw new BadRequestException("An XLSX workbook is required");

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, { type: "buffer" });
    } catch {
      throw new BadRequestException("The workbook could not be read");
    }
    const sheetName = workbook.SheetNames.includes("Sheet5")
      ? "Sheet5"
      : dto.selectedSheetName;
    if (!sheetName || !workbook.Sheets[sheetName]) {
      throw new BadRequestException(
        "Sheet5 is required, or selectedSheetName must identify a worksheet",
      );
    }
    const rows = XLSX.utils.sheet_to_json<SalaryImportRow>(
      workbook.Sheets[sheetName],
      { defval: null },
    );
    if (!rows.length)
      throw new BadRequestException("The salary worksheet is empty");
    if (!("User" in rows[0]) || !("Salary" in rows[0])) {
      throw new BadRequestException(
        "The worksheet must contain User and Salary columns",
      );
    }

    const normalized = rows.map((row, index) => ({
      rowNumber: index + 2,
      username: String(row.User ?? "").trim(),
      salary:
        typeof row.Salary === "number"
          ? row.Salary
          : Number(String(row.Salary ?? "").replace(/,/g, "")),
    }));
    const usernames = normalized.map((row) => row.username).filter(Boolean);
    const duplicates = new Set(
      usernames.filter(
        (username, index) => usernames.indexOf(username) !== index,
      ),
    );
    const users = usernames.length
      ? await this.userRepo.find({
          where: { username: In([...new Set(usernames)]) },
        })
      : [];
    const usersByUsername = new Map(users.map((user) => [user.username, user]));
    const rejectedRows: Array<{ rowNumber: number; reason: string }> = [];
    for (const row of normalized) {
      const user = usersByUsername.get(row.username);
      let reason: string | null = null;
      if (!row.username) reason = "User is required";
      else if (!Number.isFinite(row.salary) || row.salary < 0)
        reason = "Salary must be a non-negative number";
      else if (duplicates.has(row.username))
        reason = "Duplicate User in workbook";
      else if (!user) reason = "User does not exist";
      else if (user.project_id !== projectId)
        reason = "User is not assigned to this project";
      if (reason) rejectedRows.push({ rowNumber: row.rowNumber, reason });
    }
    if (rejectedRows.length) return { updatedRows: [], rejectedRows };

    const effectiveFrom =
      dto.effectiveFrom ?? `${this.riyadhDate().slice(0, 7)}-01`;
    const updatedRows = await this.dataSource.transaction(async (manager) => {
      const result = [];
      for (const row of normalized) {
        const user = usersByUsername.get(row.username)!;
        let salary = await manager.findOne(EmployeeSalary, {
          where: { projectId, userId: user.id, effectiveFrom },
        });
        if (!salary) {
          const active = await manager.findOne(EmployeeSalary, {
            where: {
              projectId,
              userId: user.id,
              effectiveFrom: LessThanOrEqual(effectiveFrom),
            },
            order: { effectiveFrom: "DESC" },
          });
          if (
            active &&
            (!active.effectiveTo || active.effectiveTo >= effectiveFrom)
          ) {
            const previousDay = new Date(`${effectiveFrom}T00:00:00Z`);
            previousDay.setUTCDate(previousDay.getUTCDate() - 1);
            active.effectiveTo = previousDay.toISOString().slice(0, 10);
            await manager.save(active);
          }
          salary = manager.create(EmployeeSalary, {
            projectId,
            userId: user.id,
            effectiveFrom,
            effectiveTo: null,
          });
        }
        salary.monthlySalary = row.salary.toFixed(2);
        salary.importFileName = file.originalname;
        salary.importSheetName = sheetName;
        salary.importRowNumber = row.rowNumber;
        salary.updatedById = actor.id;
        await manager.save(salary);
        result.push({
          rowNumber: row.rowNumber,
          username: row.username,
          monthlySalary: row.salary,
        });
      }
      return result;
    });
    return { updatedRows, rejectedRows: [] };
  }

  private riyadhDate(now = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }

  private periodDates(month: string, now = new Date()) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new BadRequestException("month must use YYYY-MM");
    const currentDate = this.riyadhDate(now);
    const currentMonth = currentDate.slice(0, 7);
    if (month > currentMonth)
      throw new BadRequestException(
        "Future payroll months cannot be synchronized",
      );
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    return {
      startDate: `${month}-01`,
      endDate:
        month === currentMonth
          ? currentDate
          : `${month}-${String(lastDay).padStart(2, "0")}`,
    };
  }

  private async activeSalaryForDate(
    manager: any,
    projectId: string,
    userId: string,
    date: string,
  ) {
    return manager.findOne(EmployeeSalary, {
      where: [
        {
          projectId,
          userId,
          effectiveFrom: LessThanOrEqual(date),
          effectiveTo: MoreThanOrEqual(date),
        },
        {
          projectId,
          userId,
          effectiveFrom: LessThanOrEqual(date),
          effectiveTo: null,
        },
      ],
      order: { effectiveFrom: "DESC" },
    });
  }

  async syncPeriod(
    projectId: string,
    month: string,
    actor?: User,
    now = new Date(),
  ) {
    if (actor)
      this.assertProjectPayrollAccess(
        actor,
        projectId,
        EPermission.PAYROLL_MANAGE,
      );
    const project = await this.requireProject(projectId);
    if (!project.payrollEnabled)
      throw new ConflictException("Payroll is not enabled for this project");
    const { startDate, endDate } = this.periodDates(month, now);

    return this.dataSource.transaction(async (manager) => {
      let period = await manager.findOne(PayrollPeriod, {
        where: { projectId, month },
      });
      if (period?.status === PayrollPeriodStatus.PAID)
        throw new ConflictException("Paid payroll periods are locked");
      const created = !period;
      if (!period)
        period = manager.create(PayrollPeriod, {
          projectId,
          month,
          status: PayrollPeriodStatus.PENDING,
        });
      period.startDate = startDate;
      period.endDate = endDate;
      period.generatedAt = new Date();
      period.generatedById = actor?.id ?? null;
      period = await manager.save(period);

      const oldLines = await manager.find(PayrollLine, {
        where: { periodId: period.id },
      });
      if (oldLines.length) await manager.remove(PayrollLine, oldLines);
      const journeys: Journey[] = await manager.find(Journey, {
        where: {
          projectId,
          date: Between(startDate, endDate),
          is_active: true,
        },
        relations: ["user", "shift", "checkin"],
        order: { date: "ASC" },
      });
      const journeyIds = journeys.map((journey) => journey.id);
      if (journeyIds.length) {
        const oldViolations = await manager.find(PayrollViolation, {
          where: { projectId, sourceJourneyId: In(journeyIds) },
        });
        if (oldViolations.length)
          await manager.remove(PayrollViolation, oldViolations);
      }
      const rules: PayrollViolationRule[] = await manager.find(
        PayrollViolationRule,
        { where: { projectId, enabled: true }, order: { sortOrder: "ASC" } },
      );
      const domainRules = rules.map((rule) => rule.toDomain());
      const ruleVersions = new Map(
        rules.map((rule) => [rule.ruleKey, rule.version]),
      );
      const vacationRows: VacationDate[] = await manager
        .createQueryBuilder(VacationDate, "date")
        .innerJoinAndSelect("date.vacation", "vacation")
        .innerJoinAndSelect("vacation.user", "user")
        .where("vacation.overall_status = :status", { status: "approved" })
        .andWhere("date.date BETWEEN :startDate AND :endDate", {
          startDate,
          endDate,
        })
        .getMany();
      const approvedDates = new Set(
        vacationRows.map((row) => `${row.vacation.user.id}:${row.date}`),
      );
      const eventYear = Number(month.slice(0, 4));
      const previous: PayrollViolation[] = await manager.find(
        PayrollViolation,
        { where: { projectId, eventYear } },
      );
      const counts = new Map<string, number>();
      previous.forEach((item) =>
        counts.set(
          `${item.userId}:${item.ruleKey}`,
          (counts.get(`${item.userId}:${item.ruleKey}`) ?? 0) + 1,
        ),
      );
      const generated: PayrollViolation[] = [];

      for (const journey of journeys) {
        if (
          !journey.user?.id ||
          !journey.shift ||
          !journey.checkin ||
          approvedDates.has(`${journey.user.id}:${journey.date}`)
        )
          continue;
        const salary: EmployeeSalary | null = await this.activeSalaryForDate(
          manager,
          projectId,
          journey.user.id,
          journey.date,
        );
        if (!salary) continue;
        const variance = calculateShiftVariance({
          journeyDate: journey.date,
          shiftStartTime: journey.shift.startTime,
          shiftEndTime: journey.shift.endTime,
          checkInTime: journey.checkin.checkInTime,
          checkOutTime: journey.checkin.checkOutTime,
        });
        const events = [
          {
            eventType: PayrollViolationEventType.LATE_ARRIVAL,
            minutes: variance.lateMinutes,
          },
          {
            eventType: PayrollViolationEventType.EARLY_LEAVE,
            minutes: variance.earlyLeaveMinutes,
          },
        ];
        for (const event of events) {
          const matchingRule = domainRules.find(
            (rule) =>
              rule.eventType === event.eventType &&
              event.minutes >= rule.minimumMinutes &&
              (rule.maximumMinutes === null ||
                event.minutes <= rule.maximumMinutes) &&
              (rule.blocksOtherWorkers === null ||
                rule.blocksOtherWorkers === false),
          );
          if (!matchingRule || event.minutes <= 0) continue;
          const key = `${journey.user.id}:${matchingRule.ruleKey}`;
          const occurrence = (counts.get(key) ?? 0) + 1;
          const calculation = calculatePayrollViolation({
            eventType: event.eventType,
            monthlySalary: Number(salary.monthlySalary),
            minutes: event.minutes,
            blocksOtherWorkers: false,
            annualOccurrence: occurrence,
            rules: domainRules,
          });
          if (!calculation) continue;
          counts.set(key, occurrence);
          const violation = manager.create(PayrollViolation, {
            projectId,
            userId: journey.user.id,
            sourceJourneyId: journey.id,
            eventDate: journey.date,
            eventYear,
            eventType: event.eventType,
            ruleKey: calculation.ruleKey,
            ruleVersion: ruleVersions.get(calculation.ruleKey) ?? 1,
            actualMinutes: event.minutes,
            annualOccurrence: occurrence,
            actionSnapshot: calculation.action,
            policySnapshot: matchingRule as unknown as Record<string, unknown>,
            deductionAmount: calculation.deductionAmount.toFixed(2),
          });
          generated.push(await manager.save(violation));
        }
      }

      const projectSalaries: EmployeeSalary[] = await manager.find(
        EmployeeSalary,
        {
          where: { projectId, effectiveFrom: LessThanOrEqual(endDate) },
          order: { effectiveFrom: "DESC" },
        },
      );
      const latestByUser = new Map<string, EmployeeSalary>();
      projectSalaries.forEach((salary) => {
        if (
          !latestByUser.has(salary.userId) &&
          (!salary.effectiveTo || salary.effectiveTo >= startDate)
        )
          latestByUser.set(salary.userId, salary);
      });
      for (const [userId, salary] of latestByUser) {
        const userViolations = generated.filter(
          (violation) => violation.userId === userId,
        );
        const totalDeduction = roundMoney(
          userViolations.reduce(
            (sum, violation) => sum + Number(violation.deductionAmount),
            0,
          ),
        );
        const grossSalary = Number(salary.monthlySalary);
        const line = await manager.save(
          PayrollLine,
          manager.create(PayrollLine, {
            periodId: period.id,
            userId,
            salarySnapshot: grossSalary.toFixed(2),
            grossSalary: grossSalary.toFixed(2),
            totalDeduction: totalDeduction.toFixed(2),
            netPay: Math.max(
              0,
              roundMoney(grossSalary - totalDeduction),
            ).toFixed(2),
          }),
        );
        if (userViolations.length)
          await manager.save(
            PayrollLineViolation,
            userViolations.map((violation) =>
              manager.create(PayrollLineViolation, {
                lineId: line.id,
                sourceViolationId: violation.id,
                eventDate: violation.eventDate,
                eventType: violation.eventType,
                ruleKey: violation.ruleKey,
                occurrence: violation.annualOccurrence,
                actualMinutes: violation.actualMinutes,
                actionSnapshot: violation.actionSnapshot,
                policySnapshot: violation.policySnapshot,
                deductionAmount: violation.deductionAmount,
              }),
            ),
          );
      }
      return {
        created,
        projectId,
        month,
        startDate,
        endDate,
        status: period.status,
        periodId: period.id,
      };
    });
  }

  async getPeriod(projectId: string, month: string, actor: User) {
    this.assertProjectPayrollAccess(actor, projectId, EPermission.PAYROLL_READ);
    this.periodDates(month);
    const period = await this.periodRepo.findOne({
      where: { projectId, month },
      relations: ["lines", "lines.user", "lines.violations"],
    });
    if (!period) throw new NotFoundException("Payroll period not found");
    return period;
  }

  async markPaid(periodId: string, actor: User) {
    return this.dataSource.transaction(async (manager) => {
      const period = await manager.findOne(PayrollPeriod, {
        where: { id: periodId },
      });
      if (!period) throw new NotFoundException("Payroll period not found");
      this.assertProjectPayrollAccess(
        actor,
        period.projectId,
        EPermission.PAYROLL_MANAGE,
      );
      if (period.status === PayrollPeriodStatus.PAID)
        throw new ConflictException("Payroll period is already paid");
      period.status = PayrollPeriodStatus.PAID;
      period.paidAt = new Date();
      period.paidById = actor.id;
      return manager.save(period);
    });
  }

  async syncMonthEndForEnabledProjects(now = new Date()) {
    const month = this.riyadhDate(now).slice(0, 7);
    const projects = await this.projectRepo.find({
      where: { payrollEnabled: true },
    });
    const results = [];
    for (const project of projects) {
      try {
        results.push(await this.syncPeriod(project.id, month, undefined, now));
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    return results;
  }

  async resetAnnualCounters() {
    return { reset: true, strategy: "calendar-year-scoped-occurrences" };
  }
}
