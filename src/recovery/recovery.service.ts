import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import * as XLSX from "xlsx";
import * as crypto from "crypto";
import * as argon2 from "argon2";
import { User } from "entities/user.entity";
import { Branch } from "entities/branch.entity";
import { Chain } from "entities/locations/chain.entity";
import { City } from "entities/locations/city.entity";
import { Region } from "entities/locations/region.entity";
import { Country } from "entities/locations/country.entity";
import { Project } from "entities/project.entity";
import { Shift } from "entities/employee/shift.entity";
import { Product } from "entities/products/product.entity";
import { Brand } from "entities/products/brand.entity";
import { Category } from "entities/products/category.entity";
import { Stock } from "entities/products/stock.entity";
import { Sale } from "entities/products/sale.entity";
import {
  CheckIn,
  Journey,
  JourneyPlan,
  JourneyStatus,
  JourneyType,
} from "entities/all_plans.entity";
import { SalesTargetType } from "entities/sales-target.entity";
import { BrandAssignmentMode } from "enums/BrandAssignmentMode.enum";
import { ERole } from "enums/Role.enum";
import { Role } from "entities/role.entity";
import {
  bump,
  emptySummary,
  RecoveryReportType,
  RecoveryResult,
  RecoveryRowResult,
} from "./recovery.types";
import { RecoveryJob } from "./recovery-job.entity";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const RECOVERY_USERNAME = "recovery.system";

@Injectable()
export class RecoveryService {
  private readonly logger = new Logger(RecoveryService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(RecoveryJob)
    private readonly recoveryJobRepo: Repository<RecoveryJob>,
  ) {}

  // ---------------------------------------------------------------- public

  /**
   * Start an import job and return immediately. The import runs in the
   * background; poll GET /recovery/jobs/:id for status and results.
   */
  async startImportJob(params: {
    type: RecoveryReportType;
    projectName: string;
    dryRun: boolean;
    fileBuffer: Buffer;
    saleDate?: string;
  }): Promise<RecoveryJob> {
    const job = this.recoveryJobRepo.create({
      type: params.type,
      projectName: params.projectName,
      dryRun: params.dryRun,
      saleDate: params.saleDate ?? null,
      status: "pending",
      summary: null,
      rows: null,
      project: null,
      errorMessage: null,
    });
    const saved = await this.recoveryJobRepo.save(job);

    // Run outside the request/response cycle so the gateway doesn't time out.
    this.runJob(saved.id, params).catch((err) => {
      this.logger.error(`Recovery job ${saved.id} failed`, err.stack);
    });

    return saved;
  }

  private async runJob(
    jobId: string,
    params: {
      type: RecoveryReportType;
      projectName: string;
      dryRun: boolean;
      fileBuffer: Buffer;
      saleDate?: string;
    },
  ): Promise<void> {
    await this.recoveryJobRepo.update(jobId, { status: "running" });

    try {
      const result = await this.importReport(params);
      await this.recoveryJobRepo.update(jobId, {
        status: "completed",
        summary: result.summary,
        rows: result.rows as any,
        project: result.project,
        errorMessage: null,
      });
    } catch (err) {
      await this.recoveryJobRepo.update(jobId, {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async getJob(id: string): Promise<RecoveryJob> {
    const job = await this.recoveryJobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Recovery job '${id}' not found`);
    return job;
  }

  async importReport(params: {
    type: RecoveryReportType;
    projectName: string;
    dryRun: boolean;
    fileBuffer: Buffer;
    saleDate?: string;
  }): Promise<RecoveryResult> {
    const { type, projectName, dryRun, fileBuffer } = params;

    const wb = XLSX.read(fileBuffer, { type: "buffer" });
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    const manager = queryRunner.manager;

    const summary = emptySummary();
    const rows: RecoveryRowResult[] = [];
    const push = (r: RecoveryRowResult) => {
      rows.push(r);
      bump(summary, r.action);
    };

    try {
      const project = await manager
        .getRepository(Project)
        .createQueryBuilder("p")
        .where("lower(p.name) = :n", { n: projectName.trim().toLowerCase() })
        .getOne();
      if (!project) {
        throw new BadRequestException(
          `Project '${projectName}' not found in the database. Recovery is always scoped to an existing project.`,
        );
      }

      const ctx = new RecoveryContext(manager, project, push);
      await ctx.init();

      if (type === "attendance") {
        await this.importAttendance(wb, ctx);
      } else if (type === "branches") {
        await this.importBranches(wb, ctx);
      } else if (type === "stock") {
        await this.importStock(wb, ctx, params.saleDate);
      } else if (type === "monthly") {
        await this.importMonthly(wb, ctx);
      } else {
        throw new BadRequestException(`Unknown recovery report type '${type}'`);
      }

      if (dryRun) {
        await queryRunner.rollbackTransaction();
      } else {
        await queryRunner.commitTransaction();
      }

      return {
        dryRun,
        type,
        project: { id: project.id, name: project.name },
        summary,
        rows,
      };
    } catch (err) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ---------------------------------------------------------- attendance

  private async importAttendance(wb: XLSX.WorkBook, ctx: RecoveryContext) {
    const sheet = wb.Sheets["Unplanned"] ?? wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
      defval: null,
      raw: true,
    });
    let i = 0;
    for (const r of rows) {
      i++;
      await this.processAttendanceRow(r, i, "Unplanned", ctx);
    }
  }

  /**
   * One row-level attendance record (Unplanned export / Overtime sheet share
   * the same layout) → users + branches + shifts + journey_plans + journeys
   * + check_ins. Extra columns (Is Late, overtime minutes, ...) are derived
   * values and intentionally ignored.
   */
  private async processAttendanceRow(
    r: Record<string, any>,
    i: number,
    sheetName: string,
    ctx: RecoveryContext,
  ) {
    const username = norm(r["user username"]);
    const name = norm(r["user name"]);
    const date = toISODate(r["date"]);
    const status = norm(r["status"])?.toLowerCase();
    const key = `user=${username ?? "?"} | branch=${norm(r["branch name"]) ?? "?"} | date=${date ?? "?"}`;

    if (!username || !date || !status) {
      ctx.push({
        row: i,
        sheet: sheetName,
        entity: "journeys",
        action: "UNRESOLVED",
        confidence: "UNRESOLVED",
        reason: "missing username, date or status in the report row",
        key,
      });
      return;
    }
    if (!Object.values(JourneyStatus).includes(status as JourneyStatus)) {
      ctx.push({
        row: i,
        sheet: sheetName,
        entity: "journeys",
        action: "UNRESOLVED",
        confidence: "UNRESOLVED",
        reason: `status '${status}' is not a valid journeys.status enum value`,
        key,
      });
      return;
    }

    // --- reference data
    const user = await ctx.getOrCreateUser(
      username,
      name,
      i,
      sheetName,
      ERole.PROMOTER,
    );
    // Reports like the unplanned export are cross-project: the row's effective
    // project comes from the user (fallback: the endpoint project), and may be
    // overridden again if the branch only exists in another project.
    const rowProject = await ctx.projectForUser(user);
    const resolved = await ctx.getOrCreateBranch(
      norm(r["branch name"]),
      norm(r["Chain"]),
      norm(r["city name"]),
      i,
      sheetName,
      rowProject,
    );
    const branch = resolved.branch;
    const branchProject = resolved.project;
    if (!branch) {
      ctx.push({
        row: i,
        sheet: sheetName,
        entity: "journeys",
        action: "UNRESOLVED",
        confidence: "UNRESOLVED",
        reason: "branch could not be resolved",
        key,
      });
      return;
    }
    // Mirror the app's check-in behavior (journey.service.ts): the user's
    // home branch follows their latest journey branch.
    await ctx.syncUserHomeBranch(user.id, branch.id, date);
    const shiftStart = toHMS(r["shift startTime"]);
    const shiftEnd = toHMS(r["shift endTime"]);
    if (!shiftStart || !shiftEnd) {
      ctx.push({
        row: i,
        sheet: sheetName,
        entity: "journeys",
        action: "UNRESOLVED",
        confidence: "UNRESOLVED",
        reason: "missing/unparseable shift startTime/endTime",
        key,
      });
      return;
    }
    const shift = await ctx.getOrCreateShift(shiftStart, shiftEnd, i, sheetName, branchProject);

    // --- journey plan (minimal reconstruction, inactive so cron ignores it)
    const plan = await ctx.getOrCreatePlan(user.id, branch.id, shift.id, date, branchProject.id);

    const journey = await ctx.upsertJourney({
      userId: user.id,
      branchId: branch.id,
      shiftId: shift.id,
      planId: plan?.id ?? null,
      date,
      status: status as JourneyStatus,
      projectId: branchProject.id,
      row: i,
      sheet: sheetName,
      key,
    });

    // --- check-in
    const checkInTime = riyadhToUtc(date, toHMS(r["Check in time"]));
    let checkOutTime = riyadhToUtc(date, toHMS(r["Check out time"]));
    if (checkInTime && checkOutTime && checkOutTime < checkInTime) {
      // shift crossed midnight (Saudi wall clock)
      checkOutTime = new Date(checkOutTime.getTime() + 24 * 3600 * 1000);
    }
    if (!checkInTime) return; // absent/vacation rows carry no check-in row

    await ctx.upsertCheckIn({
      journeyId: journey.id,
      userId: user.id,
      journeyStatus: status as JourneyStatus,
      checkInTime,
      checkOutTime,
      checkInDocument: urlToPath(r["Check in image"]),
      checkOutDocument: urlToPath(r["Check out image"]),
      row: i,
      sheet: sheetName,
      key,
      extraIds: { branchId: branch.id },
    });
  }

  // ------------------------------------------------------------ branches

  private async importBranches(wb: XLSX.WorkBook, ctx: RecoveryContext) {
    const sheet = wb.Sheets["Branches"];
    if (!sheet) {
      throw new BadRequestException(
        `No 'Branches' sheet found in workbook. Available sheets: ${wb.SheetNames.join(", ")}. ` +
          "Use this endpoint with branches_export_*.xlsx only.",
      );
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
      defval: null,
      raw: true,
    });

    let i = 0;
    for (const r of rows) {
      i++;
      const branchName = norm(r["Name"]);
      const chainName = norm(r["Chain Name"]);
      const cityName = norm(r["City Name"]);
      const key = `branch=${branchName ?? "?"} | chain=${chainName ?? "?"} | city=${cityName ?? "?"}`;
      if (!branchName) {
        ctx.push({
          row: i,
          sheet: "Branches",
          entity: "branches",
          action: "UNRESOLVED",
          confidence: "UNRESOLVED",
          reason: "missing branch name",
          key,
        });
        continue;
      }

      const branch = (await ctx.getOrCreateBranch(branchName, chainName, cityName, i, "Branches")).branch;
      if (!branch) continue;

      // --- update branch attributes from the export
      const branchRepo = ctx.manager.getRepository(Branch);
      let changed = false;
      const lat = toNum(r["Branches Lat"]);
      const lng = toNum(r["Branches Lng"]);
      if (lat != null && lng != null) {
        const g: any = branch.geo;
        if (!g || g.lat !== lat || g.lng !== lng) {
          branch.geo = { lat, lng };
          changed = true;
        }
      }
      const radius = toNum(r["Geofence Radius Meters"]);
      if (radius != null && branch.geofence_radius_meters !== radius) {
        branch.geofence_radius_meters = radius;
        changed = true;
      }
      const stt = norm(r["Salestargettype"])?.toLowerCase();
      if (
        stt &&
        Object.values(SalesTargetType).includes(stt as SalesTargetType) &&
        branch.salesTargetType !== stt
      ) {
        branch.salesTargetType = stt as SalesTargetType;
        changed = true;
      }
      const targetAmount = toNum(r["Defaultsalestargetamount"]);
      if (targetAmount != null && +(branch.defaultSalesTargetAmount ?? -1) !== targetAmount) {
        branch.defaultSalesTargetAmount = targetAmount;
        changed = true;
      }
      const auto = toBool(r["Autocreatesalestargets"]);
      if (auto != null && branch.autoCreateSalesTargets !== auto) {
        branch.autoCreateSalesTargets = auto;
        changed = true;
      }
      // Note: "Branches Is Active" has no branches.is_active column in the schema
      // (soft-delete via deleted_at is the lifecycle flag) — intentionally not mapped.
      if (changed) await branchRepo.save(branch);

      ctx.push({
        row: i,
        sheet: "Branches",
        entity: "branches",
        action: changed ? "UPDATED" : "EXISTING",
        confidence: "CONFIRMED",
        key,
        ids: { branchId: branch.id },
      });

      // --- supervisor user
      const supUsername = norm(r["Branches Username"]);
      if (!supUsername) continue;
      const sup = await ctx.getOrCreateUser(
        supUsername,
        norm(r["Branches Name"]),
        i,
        "Branches",
        ERole.SUPERVISOR,
        {
          mobile: norm(r["Branches Mobile"]),
          isActive: toBool(r["Branches Is Active"]),
        },
      );

      const avatar = urlToPath(r["Image URL"]);
      const mode = norm(r["Branches Brandassignmentmode"])?.toLowerCase();
      let userChanged = false;
      if (avatar && sup.avatar_url !== avatar) {
        sup.avatar_url = avatar;
        userChanged = true;
      }
      if (
        mode &&
        Object.values(BrandAssignmentMode).includes(mode as BrandAssignmentMode) &&
        sup.brandAssignmentMode !== mode
      ) {
        sup.brandAssignmentMode = mode as BrandAssignmentMode;
        userChanged = true;
      }
      if (userChanged) await ctx.manager.getRepository(User).save(sup);

      const linked = await ctx.manager
        .createQueryBuilder()
        .relation(Branch, "supervisors")
        .of(branch.id)
        .loadMany<User>();
      let supAction: "EXISTING" | "UPDATED" = "EXISTING";
      if ((branch.supervisor as any)?.id !== sup.id) {
        branch.supervisor = { id: sup.id } as User;
        await branchRepo.save(branch);
        supAction = "UPDATED";
      }
      if (!linked.some((u) => u.id === sup.id)) {
        await ctx.manager
          .createQueryBuilder()
          .relation(Branch, "supervisors")
          .of(branch.id)
          .add(sup.id);
        supAction = "UPDATED";
      }
      ctx.push({
        row: i,
        sheet: "Branches",
        entity: "branch_supervisors",
        action: supAction,
        confidence: "CONFIRMED",
        reason: userChanged ? "supervisor avatar/mode also updated" : undefined,
        key: `${key} | supervisor=${supUsername}`,
        ids: { branchId: branch.id, userId: sup.id },
      });
    }
  }

  // --------------------------------------------------------------- stock

  private async importStock(
    wb: XLSX.WorkBook,
    ctx: RecoveryContext,
    saleDate?: string,
  ) {
    // ---- Stock sheet: product (rows) x branch (columns) quantity matrix
    const stockSheet = wb.Sheets["Stock"];
    if (stockSheet) {
      const grid = XLSX.utils.sheet_to_json<any[]>(stockSheet, {
        header: 1,
        defval: null,
        raw: true,
      });
      const header = grid[0] ?? [];
      for (let ri = 1; ri < grid.length; ri++) {
        const rowArr = grid[ri];
        const productName = norm(rowArr?.[0]);
        if (!productName || productName.toLowerCase().includes("grand total")) continue;
        const product = await ctx.getOrCreateProduct(productName, ri, "Stock");

        for (let ci = 1; ci < header.length; ci++) {
          const branchName = norm(header[ci]);
          if (!branchName) continue;
          const qty = toNum(rowArr?.[ci]);
          if (qty == null) {
            ctx.push({
              row: ri,
              sheet: "Stock",
              entity: "stocks",
              action: "SKIPPED",
              confidence: "CONFIRMED",
              reason: "no quantity value ('-') in report cell",
              key: `product=${productName} | branch=${branchName}`,
            });
            continue;
          }
          const branch = await ctx.findBranchByName(branchName, ri, "Stock");
          if (!branch) {
            ctx.push({
              row: ri,
              sheet: "Stock",
              entity: "stocks",
              action: "UNRESOLVED",
              confidence: "UNRESOLVED",
              reason: `branch '${branchName}' not found (or ambiguous) in project`,
              key: `product=${productName} | branch=${branchName}`,
              ids: { productId: product.id },
            });
            continue;
          }
          await ctx.upsertStock(product.id, branch.id, Math.trunc(qty), ri, productName, branchName);
        }
      }
    }

    // ---- SixSeven Report sheet: synthetic aggregate sales (approved approach)
    const sixSeven = wb.Sheets["SixSeven Report"];
    if (sixSeven) {
      const grid = XLSX.utils.sheet_to_json<any[]>(sixSeven, {
        header: 1,
        defval: null,
        raw: true,
      });
      // layout: row0 = pivot banner, row1 = chain headers, rows 2.. = products
      const header = grid[1] ?? [];
      const chainCols: { idx: number; chain: string }[] = [];
      for (let ci = 1; ci < header.length; ci++) {
        const h = norm(header[ci]);
        if (!h || h.toLowerCase() === "grand total") break;
        chainCols.push({ idx: ci, chain: h });
      }
      const effectiveDate = saleDate ?? "2026-08-12";
      const saleRepo = ctx.manager.getRepository(Sale);

      for (let ri = 2; ri < grid.length; ri++) {
        const productName = norm(grid[ri]?.[0]);
        if (!productName || productName.toLowerCase() === "grand total") continue;
        const product = await ctx.getOrCreateProduct(productName, ri, "SixSeven Report");

        for (const { idx, chain } of chainCols) {
          const qty = toNum(grid[ri]?.[idx]);
          if (qty == null || qty <= 0) continue;
          const key = `product=${productName} | chain=${chain} | qty=${qty}`;

          const existing = await saleRepo
            .createQueryBuilder("s")
            .where('s."productId" = :p', { p: product.id })
            .andWhere('s."userId" = :u', { u: ctx.recoveryUserId })
            .andWhere('s."branchId" IS NULL')
            .andWhere("s.projectId = :pid", { pid: ctx.project.id })
            .andWhere("s.quantity = :q", { q: Math.trunc(qty) })
            .andWhere("s.sale_date::date = :d", { d: effectiveDate })
            .getOne();

          if (existing) {
            ctx.push({
              row: ri,
              sheet: "SixSeven Report",
              entity: "sale",
              action: "DUPLICATE",
              confidence: "CONFIRMED",
              reason: "synthetic aggregate sale already recovered",
              key,
              ids: { saleId: existing.id, productId: product.id },
            });
            continue;
          }

          const price = +(product.price ?? 0);
          const saved = await saleRepo.save(
            saleRepo.create({
              price,
              quantity: Math.trunc(qty),
              total_amount: price * Math.trunc(qty),
              status: "completed",
              sale_date: new Date(`${effectiveDate}T12:00:00Z`),
              productId: product.id,
              userId: ctx.recoveryUserId,
              branchId: null,
              projectId: ctx.project.id,
              isFromOrigin: false,
            }),
          );
          ctx.push({
            row: ri,
            sheet: "SixSeven Report",
            entity: "sale",
            action: "CREATED",
            confidence: "PROBABLE",
            reason: `SYNTHETIC aggregate row from product x chain pivot (chain '${chain}'); original per-sale date/user/branch not recoverable`,
            key,
            ids: { saleId: saved.id, productId: product.id },
          });
        }
      }
    }

    if (!stockSheet && !sixSeven) {
      throw new BadRequestException(
        `No 'Stock' or 'SixSeven Report' sheet found. Available sheets: ${wb.SheetNames.join(", ")}. ` +
          "Use this endpoint with gatemea_report_*.xlsx only.",
      );
    }
  }

  // -------------------------------------------------------------- monthly

  /**
   * Monthly project report (e.g. taqnia). Sheets:
   *  - "Overtime"             → row-level journeys + check_ins (same layout as Unplanned export)
   *  - "Sales by Model"       → product enrichment (brand/category/sku/model)
   *  - "Sales Detail"         → real sale rows
   *  - "SAR Entries"          → derived pivot; validated against recovered sales, never inserted
   *  - "Attendance" / "MG Attendance" (+ "Check-in - Check-out" times)
   *                           → journeys for user+date combos NOT covered by Overtime
   */
  private async importMonthly(wb: XLSX.WorkBook, ctx: RecoveryContext) {
    // 1) Overtime → attendance (also builds the coverage map used by the grids)
    const overtime = wb.Sheets["Overtime"];
    const covered = new Set<string>(); // "username|branch|date" present in Overtime
    let evidenceHorizon: string | null = null; // max date with real evidence
    if (overtime) {
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(overtime, {
        defval: null,
        raw: true,
      });
      let i = 0;
      for (const r of rows) {
        i++;
        const u = norm(r["user username"]);
        const b = norm(r["branch name"]);
        const d = toISODate(r["date"]);
        if (u && b && d) covered.add(`${u.toLowerCase()}|${b.toLowerCase()}|${d}`);
        if (d && (!evidenceHorizon || d > evidenceHorizon)) evidenceHorizon = d;
        await this.processAttendanceRow(r, i, "Overtime", ctx);
      }
    }

    // 2) Sales by Model → product enrichment
    const byModel = wb.Sheets["Sales by Model"];
    if (byModel) {
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(byModel, {
        defval: null,
        raw: true,
      });
      let i = 0;
      for (const r of rows) {
        i++;
        const name = norm(r["Product Name"]);
        const model = norm(r["Model"]);
        if (!name && !model) continue;
        await ctx.getOrCreateProductForSale({
          model,
          name,
          brandName: norm(r["Brand"]),
          categoryName: norm(r["Category"]),
          sku: norm(r["SKU"]),
          row: i,
          sheet: "Sales by Model",
        });
      }
    }

    // 3) Sales Detail → real sale rows (and per user+day SAR totals for step 4)
    const salesDetail = wb.Sheets["Sales Detail"];
    const sarTotals = new Map<string, number>(); // "username|date" → total SAR
    if (salesDetail) {
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(salesDetail, {
        defval: null,
        raw: true,
      });
      let i = 0;
      for (const r of rows) {
        i++;
        const username = norm(r["User Username"]);
        const date = toISODate(r["Date of Sale"]);
        const model = norm(r["Product Model"]);
        const key = `user=${username ?? "?"} | product=${model ?? "?"} | date=${date ?? "?"} | qty=${r["Quantity"] ?? "?"}`;

        const quantity = toNum(r["Quantity"]);
        const price = toNum(r["Price"]);
        const totalAmount = toNum(r["Total Amount"]) ?? (price != null && quantity != null ? price * quantity : null);
        const saleDate = date ? wallClockToTimestamp(date, toHMS(r["Time of Sale"]) ?? "00:00:00") : null;

        if (!username || !date || !model || quantity == null || price == null || totalAmount == null || !saleDate) {
          ctx.push({
            row: i,
            sheet: "Sales Detail",
            entity: "sale",
            action: "UNRESOLVED",
            confidence: "UNRESOLVED",
            reason: "missing username/date/product/quantity/price/total or unparseable sale time",
            key,
          });
          continue;
        }

        const user = await ctx.getOrCreateUser(username, norm(r["User Name"]), i, "Sales Detail", ERole.PROMOTER, {
          mobile: norm(r["User Mobile"]),
          nationalId: norm(r["National ID"]),
        });
        const branch = (
          await ctx.getOrCreateBranch(
            norm(r["Branch"]),
            norm(r["Chain"]),
            norm(r["City Name"]),
            i,
            "Sales Detail",
          )
        ).branch;
        if (!branch) {
          ctx.push({
            row: i,
            sheet: "Sales Detail",
            entity: "sale",
            action: "UNRESOLVED",
            confidence: "UNRESOLVED",
            reason: "branch could not be resolved",
            key,
            ids: { userId: user.id },
          });
          continue;
        }
        const product = await ctx.getOrCreateProductForSale({
          model,
          name: model,
          brandName: norm(r["Brand"]),
          categoryName: norm(r["Categories"]),
          row: i,
          sheet: "Sales Detail",
        });
        if (!product) continue;

        await ctx.insertSaleOnce({
          userId: user.id,
          branchId: branch.id,
          productId: product.id,
          price,
          quantity: Math.trunc(quantity),
          totalAmount,
          saleDate,
          row: i,
          sheet: "Sales Detail",
          key,
        });

        const sarKey = `${username.toLowerCase()}|${date}`;
        sarTotals.set(sarKey, (sarTotals.get(sarKey) ?? 0) + totalAmount);
      }
    }

    // 4) SAR Entries → validation only (derived pivot of sales)
    const sar = wb.Sheets["SAR Entries"];
    if (sar) {
      const grid = XLSX.utils.sheet_to_json<any[]>(sar, { header: 1, defval: null, raw: true });
      const header = grid[0] ?? [];
      const dayCols: { idx: number; date: string }[] = [];
      for (let ci = 8; ci < header.length; ci++) {
        const d = toISODate(header[ci]);
        if (d) dayCols.push({ idx: ci, date: d });
      }
      for (let ri = 1; ri < grid.length; ri++) {
        const username = norm(grid[ri]?.[0]);
        if (!username) continue;
        for (const { idx, date } of dayCols) {
          const expected = toNum(grid[ri]?.[idx]);
          if (expected == null) continue;
          const actual = sarTotals.get(`${username.toLowerCase()}|${date}`) ?? 0;
          const match = Math.abs(actual - expected) <= 1; // SAR pivot is rounded to whole SAR
          ctx.push({
            row: ri,
            sheet: "SAR Entries",
            entity: "sale",
            action: match ? "EXISTING" : "UNRESOLVED",
            confidence: match ? "CONFIRMED" : "UNRESOLVED",
            reason: match
              ? `validated: SAR pivot (${expected}) matches sum of recovered sales (${actual})`
              : `MISMATCH: SAR pivot shows ${expected} but recovered sales sum to ${actual} — review manually`,
            key: `user=${username} | date=${date}`,
          });
        }
      }
    }

    // 5) Attendance grids → journeys for user+date NOT covered by Overtime
    const ccGrid = wb.Sheets["Check-in - Check-out"]
      ? XLSX.utils.sheet_to_json<any[]>(wb.Sheets["Check-in - Check-out"], { header: 1, defval: null, raw: true })
      : null;
    const ccTimes = new Map<string, { in: string | null; out: string | null }>();
    if (ccGrid && ccGrid.length > 2) {
      const dayCols: { inIdx: number; outIdx: number; date: string }[] = [];
      const hdr = ccGrid[0] ?? [];
      for (let ci = 8; ci < hdr.length; ci++) {
        const d = toISODate(hdr[ci]);
        if (d) dayCols.push({ inIdx: ci, outIdx: ci + 1, date: d });
      }
      for (let ri = 2; ri < ccGrid.length; ri++) {
        const username = norm(ccGrid[ri]?.[0]);
        const branch = norm(ccGrid[ri]?.[7]);
        if (!username || !branch) continue;
        for (const { inIdx, outIdx, date } of dayCols) {
          ccTimes.set(`${username.toLowerCase()}|${branch.toLowerCase()}|${date}`, {
            in: toHMS(ccGrid[ri]?.[inIdx]),
            out: toHMS(ccGrid[ri]?.[outIdx]),
          });
        }
      }
    }

    for (const sheetName of ["Attendance", "MG Attendance"] as const) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const grid = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null, raw: true });
      const header = grid[0] ?? [];
      const dayCols: { idx: number; date: string }[] = [];
      for (let ci = 8; ci < header.length; ci++) {
        const d = toISODate(header[ci]);
        if (d) dayCols.push({ idx: ci, date: d });
      }
      for (let ri = 1; ri < grid.length; ri++) {
        const username = norm(grid[ri]?.[0]);
        const name = norm(grid[ri]?.[2]);
        const city = norm(grid[ri]?.[5]);
        const chain = norm(grid[ri]?.[6]);
        const branchName = norm(grid[ri]?.[7]);
        if (!username || !branchName || branchName.toUpperCase() === "N/A") continue;

        for (const { idx, date } of dayCols) {
          const cell = grid[ri]?.[idx];
          if (cell == null || cell === "") continue;
          // Grid columns run to month-end, but cells past the evidence horizon
          // are template zeros/future vacations — importing them would fabricate
          // future journeys the cron has not created yet.
          if (evidenceHorizon && date > evidenceHorizon) continue;
          const coverageKey = `${username.toLowerCase()}|${branchName.toLowerCase()}|${date}`;
          if (covered.has(coverageKey)) continue; // already handled row-level via Overtime

          const key = `user=${username} | branch=${branchName} | date=${date}`;
          const cellStr = String(cell).trim().toLowerCase();
          let status: JourneyStatus;
          if (cellStr === "vacation") status = JourneyStatus.VACATION;
          else if (cellStr === "1" || cell === 1) status = JourneyStatus.PRESENT; // may upgrade to CLOSED via CC times
          else if (cellStr === "0" || cell === 0) status = JourneyStatus.ABSENT;
          else continue; // unknown cell content — ignore silently (totals columns etc.)

          const user = await ctx.getOrCreateUser(username, name, ri, sheetName, ERole.PROMOTER);
          const resolved = await ctx.getOrCreateBranch(branchName, chain, city, ri, sheetName);
          const branch = resolved.branch;
          if (!branch) {
            ctx.push({
              row: ri, sheet: sheetName, entity: "journeys",
              action: "UNRESOLVED", confidence: "UNRESOLVED",
              reason: "branch could not be resolved", key,
            });
            continue;
          }
          await ctx.syncUserHomeBranch(user.id, branch.id, date);

          // upgrade to CLOSED + check_in when the Check-in - Check-out grid has real times
          const times = ccTimes.get(coverageKey);
          const checkInTime = times?.in ? riyadhToUtc(date, times.in) : null;
          let checkOutTime = times?.out ? riyadhToUtc(date, times.out) : null;
          if (checkInTime && checkOutTime && checkOutTime < checkInTime) {
            checkOutTime = new Date(checkOutTime.getTime() + 24 * 3600 * 1000);
          }
          if (status === JourneyStatus.PRESENT && checkInTime && checkOutTime) {
            status = JourneyStatus.CLOSED;
          }

          // grid rows carry no shift/plan — natural key uses shiftId NULL
          const journey = await ctx.upsertJourney({
            userId: user.id, branchId: branch.id, shiftId: null, planId: null,
            date, status, projectId: resolved.project.id, row: ri, sheet: sheetName, key,
          });

          if (checkInTime) {
            await ctx.upsertCheckIn({
              journeyId: journey.id, userId: user.id, journeyStatus: status,
              checkInTime, checkOutTime,
              checkInDocument: null, checkOutDocument: null,
              row: ri, sheet: sheetName, key, extraIds: { branchId: branch.id },
            });
          }
        }
      }
    }

    if (!overtime && !salesDetail && !byModel) {
      throw new BadRequestException(
        "Workbook does not look like a monthly report (no Overtime / Sales Detail / Sales by Model sheets)",
      );
    }
  }
}

// ------------------------------------------------------------------ context

class RecoveryContext {
  private userCache = new Map<string, User>();
  private chainCache = new Map<string, Chain>();
  private cityCache = new Map<string, City>();
  private branchCache = new Map<string, { branch: Branch | null; project: Project }>();
  private branchNameOnlyCache = new Map<string, Branch | null>();
  private projectById = new Map<string, Project>();
  private shiftCache = new Map<string, Shift>();
  private planCache = new Map<string, JourneyPlan>();
  private productCache = new Map<string, Product>();
  private recoveryUser: User;

  constructor(
    public readonly manager: EntityManager,
    public readonly project: Project,
    public readonly push: (r: RecoveryRowResult) => void,
  ) {}

  async init() {
    await this.ensureRecoveryUser();
  }

  get recoveryUserId(): string {
    return this.recoveryUser?.id;
  }

  private async ensureRecoveryUser(): Promise<User> {
    if (this.recoveryUser) return this.recoveryUser;
    let u = await this.manager
      .getRepository(User)
      .createQueryBuilder("u")
      .withDeleted()
      .where("u.username = :n", { n: RECOVERY_USERNAME })
      .getOne();
    if (!u) {
      u = await this.manager.getRepository(User).save(
        this.manager.getRepository(User).create({
          username: RECOVERY_USERNAME,
          name: "Recovery System (do not use)",
          password: crypto.randomBytes(24).toString("hex"),
          project_id: this.project.id,
          is_active: false,
        }),
      );
    } else if (u.deleted_at) {
      u.deleted_at = null;
      await this.manager.getRepository(User).save(u);
    }
    this.recoveryUser = u;
    this.userCache.set(RECOVERY_USERNAME.toLowerCase(), u);
    return u;
  }

  async getOrCreateUser(
    username: string,
    name: string | null,
    row: number,
    sheet: string,
    roleName?: ERole,
    extra?: { mobile?: string | null; isActive?: boolean | null; nationalId?: string | null },
  ): Promise<User> {
    const cacheKey = username.toLowerCase();
    const cached = this.userCache.get(cacheKey);
    if (cached) return cached;

    const repo = this.manager.getRepository(User);
    let user = await repo
      .createQueryBuilder("u")
      .withDeleted()
      .leftJoinAndSelect("u.role", "role")
      .where("lower(u.username) = :n", { n: cacheKey })
      .getOne();

    // mobile has a UNIQUE index — never let a report value collide with another account
    let mobile = extra?.mobile ?? null;
    let mobileConflict = false;
    if (mobile) {
      const conflict = await repo
        .createQueryBuilder("u")
        .withDeleted()
        .where("u.mobile = :m", { m: mobile })
        .andWhere(user ? "u.id != :id" : "1=1", { id: user?.id })
        .getOne();
      if (conflict) {
        mobile = null;
        mobileConflict = true;
      }
    }

    if (user) {
      let changed = false;
      const reasons: string[] = [];
      if (user.deleted_at) {
        user.deleted_at = null;
        changed = true;
        reasons.push("restored soft-deleted account");
      }
      if (name && !user.name) {
        user.name = name;
        changed = true;
      }
      if (!user.project_id) {
        user.project_id = this.project.id;
        changed = true;
      }
      if (mobile && !user.mobile) {
        user.mobile = mobile;
        changed = true;
      }
      if (extra?.nationalId && !user.national_id) {
        user.national_id = extra.nationalId;
        changed = true;
      }
      if (extra?.isActive != null && user.is_active !== extra.isActive) {
        user.is_active = extra.isActive;
        changed = true;
        reasons.push(`is_active := ${extra.isActive} (from report)`);
      }
      if (roleName && !user.role) {
        const role = await this.getRole(roleName);
        if (role) {
          user.role = role;
          changed = true;
        }
      }
      if (mobileConflict) reasons.push("report mobile already belongs to another account — skipped");
      if (changed || mobileConflict) {
        if (changed) await repo.save(user);
        this.push({
          row,
          sheet,
          entity: "users",
          action: changed ? "UPDATED" : "SKIPPED",
          confidence: "CONFIRMED",
          reason: reasons.length ? reasons.join("; ") : "existing user restored/backfilled",
          key: `username=${username}`,
          ids: { userId: user.id },
        });
      }
    } else {
      const role = roleName ? await this.getRole(roleName) : null;
      user = await repo.save(
        repo.create({
          username,
          name: name ?? null,
          // per requirement: initial password = username (argon2, same as auth login)
          password: await argon2.hash(username),
          mobile,
          national_id: extra?.nationalId ?? null,
          project_id: this.project.id,
          role: role ?? null,
          is_active: extra?.isActive ?? true,
        }),
      );
      this.push({
        row,
        sheet,
        entity: "users",
        action: "CREATED",
        confidence: "PROBABLE",
        reason:
          `user missing from April backup — created with role '${roleName ?? "none"}', initial password = username` +
          (mobileConflict ? "; report mobile already belongs to another account — skipped" : ""),
        key: `username=${username}`,
        ids: { userId: user.id },
      });
    }
    this.userCache.set(cacheKey, user);
    return user;
  }

  private roleCache = new Map<string, Role>();

  private async getRole(name: ERole): Promise<Role | null> {
    const cached = this.roleCache.get(name);
    if (cached) return cached;
    const role = await this.manager
      .getRepository(Role)
      .findOne({ where: { name } });
    if (role) this.roleCache.set(name, role);
    return role;
  }

  /** users.branchId follows the branch of the user's latest journey (app check-in behavior). */
  private lastJourneyDate = new Map<string, string>();

  async syncUserHomeBranch(userId: string, branchId: string, date: string) {
    const last = this.lastJourneyDate.get(userId);
    if (last && last > date) return;
    this.lastJourneyDate.set(userId, date);
    await this.manager
      .getRepository(User)
      .createQueryBuilder()
      .update(User)
      .set({ branch: { id: branchId } as Branch })
      .where("id = :id", { id: userId })
      .execute();
  }

  /**
   * Effective project for a report row: the user's own project (reports like
   * the unplanned export are cross-project), falling back to the endpoint
   * project for users without one.
   */
  async projectForUser(user: User): Promise<Project> {
    const pid = (user as any)?.project_id as string | null;
    if (!pid || pid === this.project.id) return this.project;
    const cached = this.projectById.get(pid);
    if (cached) return cached;
    const p = await this.manager.getRepository(Project).findOne({ where: { id: pid } });
    const proj = p ?? this.project;
    this.projectById.set(pid, proj);
    return proj;
  }

  /** Chain lookup (no creation) scoped to a project. */
  private async findChain(name: string | null, project: Project): Promise<Chain | null> {
    if (!name) return null;
    const cacheKey = `${project.id}|${name.toLowerCase()}`;
    if (this.chainCache.has(cacheKey)) return this.chainCache.get(cacheKey) ?? null;
    const chain = await this.manager
      .getRepository(Chain)
      .createQueryBuilder("c")
      .withDeleted()
      .leftJoin("c.project", "p")
      .where("lower(c.name) = :n", { n: name.toLowerCase() })
      .andWhere("p.id = :pid", { pid: project.id })
      .getOne();
    if (chain) {
      if (chain.deleted_at) {
        chain.deleted_at = null;
        await this.manager.getRepository(Chain).save(chain);
      }
      this.chainCache.set(cacheKey, chain);
    }
    return chain;
  }

  /** Chain creation — only called when a new branch is created in that project. */
  private async createChain(
    name: string,
    project: Project,
    row: number,
    sheet: string,
  ): Promise<Chain> {
    const cacheKey = `${project.id}|${name.toLowerCase()}`;
    const repo = this.manager.getRepository(Chain);
    const chain = await repo.save(repo.create({ name, project: { id: project.id } as Project }));
    this.push({
      row,
      sheet,
      entity: "chains",
      action: "CREATED",
      confidence: "PROBABLE",
      reason: "chain missing from backup — created from report",
      key: `chain=${name}`,
      ids: { chainId: chain.id },
    });
    this.chainCache.set(cacheKey, chain);
    return chain;
  }

  async getOrCreateCity(name: string | null, row: number, sheet: string): Promise<City | null> {
    if (!name) return null;
    const cacheKey = name.toLowerCase();
    const cached = this.cityCache.get(cacheKey);
    if (cached) return cached;

    const repo = this.manager.getRepository(City);
    let city = await repo
      .createQueryBuilder("c")
      .where("lower(c.name) = :n", { n: cacheKey })
      .getOne();

    if (!city) {
      // attach to any existing region; fall back to a recovery country/region
      let region = await this.manager.getRepository(Region).find({ take: 1 }).then((r) => r[0]);
      if (!region) {
        const countryRepo = this.manager.getRepository(Country);
        let country = await countryRepo.findOne({ where: { name: "Recovery" } });
        if (!country) country = await countryRepo.save(countryRepo.create({ name: "Recovery" }));
        region = await this.manager
          .getRepository(Region)
          .save(this.manager.getRepository(Region).create({ name: "Recovery", country }));
      }
      city = await repo.save(repo.create({ name, region }));
      this.push({
        row,
        sheet,
        entity: "cities",
        action: "CREATED",
        confidence: "PROBABLE",
        reason: "city missing from backup — created from report",
        key: `city=${name}`,
        ids: { cityId: city.id },
      });
    }
    this.cityCache.set(cacheKey, city);
    return city;
  }

  /**
   * Branch resolution: name + chain + city within the effective project, with
   * progressively weaker fallbacks. Reports (esp. the unplanned export) span
   * several projects and branch names repeat across them, so the final
   * fallback is a cross-project match — when that wins, the returned project
   * is the branch's own project, not the endpoint one.
   */
  async getOrCreateBranch(
    name: string | null,
    chainName: string | null,
    cityName: string | null,
    row: number,
    sheet: string,
    project: Project = this.project,
  ): Promise<{ branch: Branch | null; project: Project }> {
    if (!name) return { branch: null, project };
    const cacheKey = `${project.id}|${name.toLowerCase()}|${chainName?.toLowerCase() ?? ""}|${cityName?.toLowerCase() ?? ""}`;
    if (this.branchCache.has(cacheKey)) return this.branchCache.get(cacheKey);

    const city = await this.getOrCreateCity(cityName, row, sheet);
    const chain = await this.findChain(chainName, project);

    const repo = this.manager.getRepository(Branch);
    const normName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const qb = () =>
      repo
        .createQueryBuilder("b")
        .withDeleted()
        .leftJoinAndSelect("b.project", "p")
        .leftJoinAndSelect("b.chain", "ch")
        .leftJoinAndSelect("b.city", "ci")
        .leftJoinAndSelect("b.supervisor", "sup")
        .where("lower(b.name) = :n", { n: name.toLowerCase() })
        .andWhere("p.id = :pid", { pid: project.id });

    // 1) strict: name + chain + city
    let branch = await qb()
      .andWhere(chain ? "ch.id = :chid" : "1=1", { chid: chain?.id })
      .andWhere(city ? "ci.id = :ciid" : "1=1", { ciid: city?.id })
      .getOne();

    // 2) relaxed: name + chain only
    if (!branch && chain) {
      branch = await qb().andWhere("ch.id = :chid", { chid: chain.id }).getOne();
    }

    // 3) fallback: name only — accept only if unambiguous
    if (!branch) {
      const candidates = await qb().getMany();
      if (candidates.length === 1) {
        branch = candidates[0];
        this.push({
          row,
          sheet,
          entity: "branches",
          action: "EXISTING",
          confidence: "PROBABLE",
          reason: `branch matched by name only (report chain/city: '${chainName ?? "-"}/${cityName ?? "-"}')`,
          key: `branch=${name}`,
          ids: { branchId: branch.id },
        });
      } else if (candidates.length > 1) {
        const result = { branch: null, project };
        this.branchCache.set(cacheKey, result);
        this.push({
          row,
          sheet,
          entity: "branches",
          action: "UNRESOLVED",
          confidence: "UNRESOLVED",
          reason: `branch name '${name}' matches ${candidates.length} branches in project '${project.name}' — manual mapping required`,
          key: `branch=${name} | chain=${chainName ?? "?"} | city=${cityName ?? "?"}`,
        });
        return result;
      }
    }

    // 4) punctuation/case-insensitive name match within the project
    //    (e.g. 'Saco World KA' vs 'Saco World K. A.', 'Extra Ghadeer' vs 'Extra Ghadir')
    if (!branch && normName) {
      const candidates = await repo
        .createQueryBuilder("b")
        .withDeleted()
        .leftJoinAndSelect("b.project", "p")
        .leftJoinAndSelect("b.chain", "ch")
        .leftJoinAndSelect("b.city", "ci")
        .leftJoinAndSelect("b.supervisor", "sup")
        .where("p.id = :pid", { pid: project.id })
        .andWhere("lower(regexp_replace(b.name, '[^a-zA-Z0-9]', '', 'g')) = :nn", { nn: normName })
        .getMany();
      if (candidates.length === 1) {
        branch = candidates[0];
        this.push({
          row,
          sheet,
          entity: "branches",
          action: "EXISTING",
          confidence: "PROBABLE",
          reason: `branch matched ignoring punctuation/spelling ('${name}' → '${branch.name}') — verify`,
          key: `branch=${name}`,
          ids: { branchId: branch.id },
        });
      }
    }

    // 5) cross-project: the row may belong to another project (e.g. Kuwait
    //    Xcite branches exist only under Bissell Saudi). Must be unambiguous.
    let matchedCrossProject = false;
    if (!branch) {
      const cq = () =>
        repo
          .createQueryBuilder("b")
          .withDeleted()
          .leftJoinAndSelect("b.project", "p")
          .leftJoinAndSelect("b.chain", "ch")
          .leftJoinAndSelect("b.city", "ci")
          .leftJoinAndSelect("b.supervisor", "sup")
          .where("lower(b.name) = :n", { n: name.toLowerCase() });

      let matches = await cq().getMany();
      if (matches.length === 0 && normName) {
        matches = await repo
          .createQueryBuilder("b")
          .withDeleted()
          .leftJoinAndSelect("b.project", "p")
          .leftJoinAndSelect("b.chain", "ch")
          .leftJoinAndSelect("b.city", "ci")
          .leftJoinAndSelect("b.supervisor", "sup")
          .where("lower(regexp_replace(b.name, '[^a-zA-Z0-9]', '', 'g')) = :nn", { nn: normName })
          .getMany();
      }
      // disambiguate by chain name when several projects have a same-named branch
      if (matches.length > 1 && chainName) {
        const narrowed = matches.filter(
          (m) => (m.chain as any)?.name?.toLowerCase() === chainName.toLowerCase(),
        );
        if (narrowed.length >= 1) matches = narrowed;
      }
      if (matches.length === 1) {
        branch = matches[0];
        matchedCrossProject = true;
      } else if (matches.length > 1) {
        const result = { branch: null, project };
        this.branchCache.set(cacheKey, result);
        this.push({
          row,
          sheet,
          entity: "branches",
          action: "UNRESOLVED",
          confidence: "UNRESOLVED",
          reason: `branch '${name}' matches branches in ${matches.length} projects — manual mapping required`,
          key: `branch=${name} | chain=${chainName ?? "?"} | city=${cityName ?? "?"}`,
        });
        return result;
      }
    }

    let effectiveProject = project;
    if (branch) {
      if (matchedCrossProject && (branch.project as any)?.id) {
        effectiveProject = branch.project as unknown as Project;
        this.projectById.set(effectiveProject.id, effectiveProject);
        this.push({
          row,
          sheet,
          entity: "branches",
          action: "EXISTING",
          confidence: "PROBABLE",
          reason: `cross-project branch match — row assigned to project '${effectiveProject.name}' — verify`,
          key: `branch=${name} | chain=${chainName ?? "-"}`,
          ids: { branchId: branch.id },
        });
      }
      if (branch.deleted_at) {
        branch.deleted_at = null;
        await repo.save(branch);
        this.push({
          row,
          sheet,
          entity: "branches",
          action: "UPDATED",
          confidence: "CONFIRMED",
          reason: "soft-deleted branch restored",
          key: `branch=${name}`,
          ids: { branchId: branch.id },
        });
      }
    } else {
      // create the branch (and its chain) in the effective project
      const newChain = chainName
        ? chain ?? (await this.createChain(chainName, effectiveProject, row, sheet))
        : null;
      branch = await repo.save(
        repo.create({
          name,
          project: { id: effectiveProject.id } as Project,
          chain: newChain ? ({ id: newChain.id } as Chain) : null,
          city: city ? ({ id: city.id } as City) : null,
        }),
      );
      branch = await qb().andWhere("b.id = :id", { id: branch.id }).getOne();
      this.push({
        row,
        sheet,
        entity: "branches",
        action: "CREATED",
        confidence: "PROBABLE",
        reason: "branch missing from backup — created from report",
        key: `branch=${name} | chain=${chainName ?? "-"} | city=${cityName ?? "-"}`,
        ids: { branchId: branch.id },
      });
    }
    const result = { branch, project: effectiveProject };
    this.branchCache.set(cacheKey, result);
    return result;
  }

  /** Name-only branch lookup used by the stock matrix (no chain/city context). */
  async findBranchByName(name: string, row: number, sheet: string): Promise<Branch | null> {
    const cacheKey = name.toLowerCase();
    if (this.branchNameOnlyCache.has(cacheKey)) return this.branchNameOnlyCache.get(cacheKey);
    const candidates = await this.manager
      .getRepository(Branch)
      .createQueryBuilder("b")
      .withDeleted()
      .leftJoin("b.project", "p")
      .where("lower(b.name) = :n", { n: name.toLowerCase() })
      .andWhere("p.id = :pid", { pid: this.project.id })
      .getMany();
    const branch = candidates.length === 1 ? candidates[0] : null;
    this.branchNameOnlyCache.set(cacheKey, branch);
    return branch;
  }

  async getOrCreateShift(
    start: string,
    end: string,
    row: number,
    sheet: string,
    project: Project = this.project,
  ): Promise<Shift> {
    const cacheKey = `${project.id}|${start}|${end}`;
    const cached = this.shiftCache.get(cacheKey);
    if (cached) return cached;

    const repo = this.manager.getRepository(Shift);
    let shift = await repo
      .createQueryBuilder("s")
      .withDeleted()
      .where('s."startTime" = :st', { st: start })
      .andWhere('s."endTime" = :et', { et: end })
      .andWhere("s.project_id = :pid", { pid: project.id })
      .getOne();

    if (shift) {
      if (shift.deleted_at) {
        shift.deleted_at = null;
        await repo.save(shift);
      }
    } else {
      shift = await repo.save(
        repo.create({
          name: `${start.slice(0, 5)}-${end.slice(0, 5)}`,
          startTime: start,
          endTime: end,
          project: { id: project.id } as Project,
        }),
      );
      this.push({
        row,
        sheet,
        entity: "shifts",
        action: "CREATED",
        confidence: "PROBABLE",
        reason: "shift missing from backup — created from report times",
        key: `shift=${start}-${end}`,
        ids: { shiftId: shift.id },
      });
    }
    this.shiftCache.set(cacheKey, shift);
    return shift;
  }

  async getOrCreatePlan(
    userId: string,
    branchId: string,
    shiftId: string,
    date: string,
    projectId: string = this.project.id,
  ): Promise<JourneyPlan> {
    const cacheKey = `${projectId}|${userId}|${branchId}|${shiftId}`;
    const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
    const cached = this.planCache.get(cacheKey);
    if (cached) {
      if (!cached.days.includes(weekday)) {
        cached.days = [...cached.days, weekday];
        await this.manager.getRepository(JourneyPlan).save(cached);
      }
      return cached;
    }

    const repo = this.manager.getRepository(JourneyPlan);
    let plan = await repo
      .createQueryBuilder("p")
      .withDeleted()
      .where('p."userId" = :u', { u: userId })
      .andWhere('p."branchId" = :b', { b: branchId })
      .andWhere('p."shiftId" = :s', { s: shiftId })
      .andWhere('p."projectId" = :pid', { pid: projectId })
      .getOne();

    if (plan) {
      let changed = false;
      if (plan.deleted_at) {
        plan.deleted_at = null;
        changed = true;
      }
      if (plan.is_active) {
        // recovered plans stay inactive so the cron never generates journeys from them
        plan.is_active = false;
        changed = true;
      }
      if (!plan.days.includes(weekday)) {
        plan.days = [...plan.days, weekday];
        changed = true;
      }
      if (changed) await repo.save(plan);
    } else {
      await this.ensureRecoveryUser();
      plan = await repo.save(
        repo.create({
          user: { id: userId } as User,
          branch: { id: branchId } as Branch,
          shift: { id: shiftId } as Shift,
          createdBy: { id: this.recoveryUser.id } as User,
          projectId,
          days: [weekday],
          is_active: false,
        }),
      );
    }
    this.planCache.set(cacheKey, plan);
    return plan;
  }

  async getOrCreateProduct(name: string, row: number, sheet: string): Promise<Product> {
    const cacheKey = name.toLowerCase();
    const cached = this.productCache.get(cacheKey);
    if (cached) return cached;

    const repo = this.manager.getRepository(Product);
    let product = await repo
      .createQueryBuilder("p")
      .withDeleted()
      .where("lower(p.name) = :n", { n: cacheKey })
      .andWhere("p.project_id = :pid", { pid: this.project.id })
      .getOne();

    if (product) {
      if (product.deleted_at) {
        product.deleted_at = null;
        await repo.save(product);
      }
    } else {
      product = await repo.save(
        repo.create({ name, project: { id: this.project.id } as Project, project_id: this.project.id }),
      );
      this.push({
        row,
        sheet,
        entity: "products",
        action: "CREATED",
        confidence: "PROBABLE",
        reason: "product missing from backup — created from report name",
        key: `product=${name}`,
        ids: { productId: product.id },
      });
    }
    this.productCache.set(cacheKey, product);
    return product;
  }

  async upsertStock(
    productId: string,
    branchId: string,
    quantity: number,
    row: number,
    productName: string,
    branchName: string,
  ) {
    const repo = this.manager.getRepository(Stock);
    let stock = await repo
      .createQueryBuilder("s")
      .withDeleted()
      .where("s.product_id = :p", { p: productId })
      .andWhere("s.branch_id = :b", { b: branchId })
      .getOne();

    const key = `product=${productName} | branch=${branchName}`;
    if (stock) {
      let changed = false;
      if (stock.deleted_at) {
        stock.deleted_at = null;
        changed = true;
      }
      if (stock.quantity !== quantity) {
        stock.quantity = quantity;
        changed = true;
      }
      if (changed) await repo.save(stock);
      this.push({
        row,
        sheet: "Stock",
        entity: "stocks",
        action: changed ? "UPDATED" : "EXISTING",
        confidence: "CONFIRMED",
        key,
        ids: { stockId: stock.id, productId, branchId },
      });
    } else {
      const saved = await repo.save(
        repo.create({ product_id: productId, branch_id: branchId, quantity }),
      );
      this.push({
        row,
        sheet: "Stock",
        entity: "stocks",
        action: "CREATED",
        confidence: "CONFIRMED",
        key,
        ids: { stockId: saved.id, productId, branchId },
      });
    }
  }

  // ---- shared journey upsert (natural key: user+branch+shift+type+date) ----

  async upsertJourney(params: {
    userId: string;
    branchId: string;
    shiftId: string | null;
    planId: string | null;
    date: string;
    status: JourneyStatus;
    projectId?: string;
    row: number;
    sheet: string;
    key: string;
  }): Promise<Journey> {
    const { userId, branchId, shiftId, planId, date, status, row, sheet, key } = params;
    const projectId = params.projectId ?? this.project.id;
    const type = status.startsWith("unplanned")
      ? JourneyType.UNPLANNED
      : JourneyType.PLANNED;

    const journeyRepo = this.manager.getRepository(Journey);
    const qb = journeyRepo
      .createQueryBuilder("j")
      .withDeleted()
      .leftJoinAndSelect("j.journeyPlan", "jp")
      .where('j."userId" = :u', { u: userId })
      .andWhere('j."branchId" = :b', { b: branchId })
      .andWhere("j.type = :t", { t: type })
      .andWhere("j.date = :d", { d: date });
    if (shiftId) qb.andWhere('j."shiftId" = :s', { s: shiftId });
    else qb.andWhere('j."shiftId" IS NULL');
    let journey = await qb.getOne();

    const ids: Record<string, string> = { userId, branchId };
    if (shiftId) ids.shiftId = shiftId;
    if (planId) ids.journeyPlanId = planId;

    let action: "EXISTING" | "CREATED" | "UPDATED";
    if (journey) {
      let changed = false;
      if (journey.deleted_at) {
        journey.deleted_at = null;
        journey.is_active = true;
        changed = true;
      }
      if (journey.status !== status) {
        journey.status = status;
        changed = true;
      }
      if (planId && journey.journeyPlan?.id !== planId) {
        journey.journeyPlan = { id: planId } as JourneyPlan;
        changed = true;
      }
      if (changed) {
        await journeyRepo.save(journey);
        action = "UPDATED";
      } else {
        action = "EXISTING";
      }
    } else {
      journey = await journeyRepo.save(
        journeyRepo.create({
          user: { id: userId } as User,
          branch: { id: branchId } as Branch,
          shift: shiftId ? ({ id: shiftId } as Shift) : null,
          type,
          date,
          status,
          is_active: true,
          journeyPlan: planId ? ({ id: planId } as JourneyPlan) : null,
          createdBy: { id: this.recoveryUserId } as User,
          projectId,
        }),
      );
      action = "CREATED";
    }
    ids.journeyId = journey.id;

    this.push({
      row,
      sheet,
      entity: "journeys",
      action,
      confidence: shiftId ? "CONFIRMED" : "PROBABLE",
      reason:
        action === "EXISTING"
          ? "journey already present (natural key match)"
          : shiftId
            ? undefined
            : "reconstructed from attendance grid — no shift/plan information in source",
      key,
      ids,
    });
    return journey;
  }

  // ---- shared check-in upsert (natural key: journeyId, O2O) ----

  async upsertCheckIn(params: {
    journeyId: string;
    userId: string;
    journeyStatus: JourneyStatus;
    checkInTime: Date;
    checkOutTime: Date | null;
    checkInDocument: string | null;
    checkOutDocument: string | null;
    row: number;
    sheet: string;
    key: string;
    extraIds?: Record<string, string>;
  }): Promise<CheckIn> {
    const {
      journeyId, userId, journeyStatus, checkInTime, checkOutTime,
      checkInDocument, checkOutDocument, row, sheet, key, extraIds,
    } = params;

    const checkInRepo = this.manager.getRepository(CheckIn);
    let checkIn = await checkInRepo
      .createQueryBuilder("c")
      .withDeleted()
      .where('c."journeyId" = :j', { j: journeyId })
      .getOne();

    const isAutoClosed =
      (journeyStatus === JourneyStatus.CLOSED ||
        journeyStatus === JourneyStatus.UNPLANNED_CLOSED) &&
      !checkOutTime;

    if (checkIn) {
      let changed = false;
      if (checkIn.deleted_at) {
        checkIn.deleted_at = null;
        changed = true;
      }
      if (+checkIn.checkInTime !== +checkInTime) {
        checkIn.checkInTime = checkInTime;
        changed = true;
      }
      if (+checkIn.checkOutTime !== +checkOutTime) {
        checkIn.checkOutTime = checkOutTime;
        changed = true;
      }
      if (checkInDocument && checkIn.checkInDocument !== checkInDocument) {
        checkIn.checkInDocument = checkInDocument;
        changed = true;
      }
      if (checkOutDocument && checkIn.checkOutDocument !== checkOutDocument) {
        checkIn.checkOutDocument = checkOutDocument;
        changed = true;
      }
      if (changed) {
        checkIn.isAutoClosed = isAutoClosed;
        await checkInRepo.save(checkIn);
      }
      this.push({
        row,
        sheet,
        entity: "check_ins",
        action: changed ? "UPDATED" : "EXISTING",
        confidence: "CONFIRMED",
        key,
        ids: { journeyId, checkInId: checkIn.id, ...extraIds },
      });
      return checkIn;
    }

    const saved = await checkInRepo.save(
      checkInRepo.create({
        journey: { id: journeyId } as Journey,
        user: { id: userId } as User,
        checkInTime,
        checkOutTime,
        checkInDocument,
        checkOutDocument,
        isWithinRadius: false,
        isAutoClosed,
      }),
    );
    this.push({
      row,
      sheet,
      entity: "check_ins",
      action: "CREATED",
      confidence: isAutoClosed ? "PROBABLE" : "CONFIRMED",
      reason: isAutoClosed
        ? "status closed but no check-out time in report — flagged isAutoClosed"
        : undefined,
      key,
      ids: { journeyId, checkInId: saved.id, ...extraIds },
    });
    return saved;
  }

  // ---- brands / categories / products (monthly sales reports) ----

  private brandCache = new Map<string, Brand>();
  private categoryCache = new Map<string, Category>();

  async getOrCreateBrand(name: string | null): Promise<Brand | null> {
    if (!name) return null;
    const cacheKey = name.toLowerCase();
    if (this.brandCache.has(cacheKey)) return this.brandCache.get(cacheKey);
    const repo = this.manager.getRepository(Brand);
    let brand = await repo
      .createQueryBuilder("b")
      .withDeleted()
      .leftJoin("b.project", "p")
      .where("lower(b.name) = :n", { n: cacheKey })
      .andWhere("p.id = :pid", { pid: this.project.id })
      .getOne();
    if (!brand) {
      brand = await repo.save(
        repo.create({ name, project: { id: this.project.id } as Project }),
      );
    } else if (brand.deleted_at) {
      brand.deleted_at = null;
      await repo.save(brand);
    }
    this.brandCache.set(cacheKey, brand);
    return brand;
  }

  async getOrCreateCategory(name: string | null): Promise<Category | null> {
    if (!name) return null;
    const cacheKey = name.toLowerCase();
    if (this.categoryCache.has(cacheKey)) return this.categoryCache.get(cacheKey);
    const repo = this.manager.getRepository(Category);
    let category = await repo
      .createQueryBuilder("c")
      .withDeleted()
      .leftJoin("c.project", "p")
      .where("lower(c.name) = :n", { n: cacheKey })
      .andWhere("p.id = :pid", { pid: this.project.id })
      .getOne();
    if (!category) {
      category = await repo.save(
        repo.create({ name, project: { id: this.project.id } as Project }),
      );
    } else if (category.deleted_at) {
      category.deleted_at = null;
      await repo.save(category);
    }
    this.categoryCache.set(cacheKey, category);
    return category;
  }

  /**
   * Product lookup for sales reports: match by model first, then by name.
   * Creates the product (with brand/category/sku when known) if missing.
   */
  async getOrCreateProductForSale(params: {
    model: string | null;
    name: string | null;
    brandName?: string | null;
    categoryName?: string | null;
    sku?: string | null;
    row: number;
    sheet: string;
  }): Promise<Product | null> {
    const { model, name, brandName, categoryName, sku, row, sheet } = params;
    if (!model && !name) return null;
    const cacheKey = `sale:${(model ?? "").toLowerCase()}|${(name ?? "").toLowerCase()}`;
    if (this.productCache.has(cacheKey)) return this.productCache.get(cacheKey);

    const repo = this.manager.getRepository(Product);
    let product: Product = null;
    if (model) {
      product = await repo
        .createQueryBuilder("p")
        .withDeleted()
        .where("lower(p.model) = :m", { m: model.toLowerCase() })
        .andWhere("p.project_id = :pid", { pid: this.project.id })
        .getOne();
    }
    if (!product && name) {
      product = await repo
        .createQueryBuilder("p")
        .withDeleted()
        .where("lower(p.name) = :n", { n: name.toLowerCase() })
        .andWhere("p.project_id = :pid", { pid: this.project.id })
        .getOne();
    }

    if (product) {
      let changed = false;
      if (product.deleted_at) {
        product.deleted_at = null;
        changed = true;
      }
      if (model && !product.model) {
        product.model = model;
        changed = true;
      }
      if (sku && !product.sku) {
        product.sku = sku;
        changed = true;
      }
      if (brandName && !(product as any).brand) {
        const brand = await this.getOrCreateBrand(brandName);
        if (brand) {
          product.brand = brand;
          changed = true;
        }
      }
      if (categoryName && !(product as any).category) {
        const category = await this.getOrCreateCategory(categoryName);
        if (category) {
          product.category = category;
          changed = true;
        }
      }
      if (changed) await repo.save(product);
    } else {
      const brand = await this.getOrCreateBrand(brandName ?? null);
      const category = await this.getOrCreateCategory(categoryName ?? null);
      product = await repo.save(
        repo.create({
          name: name ?? model,
          model: model ?? null,
          sku: sku ?? null,
          brand: brand ?? null,
          category: category ?? null,
          project: { id: this.project.id } as Project,
          project_id: this.project.id,
        }),
      );
      this.push({
        row,
        sheet,
        entity: "products",
        action: "CREATED",
        confidence: "PROBABLE",
        reason: "product missing from backup — created from sales report",
        key: `product=${name ?? model}`,
        ids: { productId: product.id },
      });
    }
    this.productCache.set(cacheKey, product);
    return product;
  }

  /** Sale insert with exact-tuple dedupe (sale has no unique constraint). */
  async insertSaleOnce(params: {
    userId: string;
    branchId: string | null;
    productId: string;
    price: number;
    quantity: number;
    totalAmount: number;
    saleDate: Date;
    row: number;
    sheet: string;
    key: string;
  }): Promise<void> {
    const { userId, branchId, productId, price, quantity, totalAmount, saleDate, row, sheet, key } =
      params;
    const repo = this.manager.getRepository(Sale);
    const qb = repo
      .createQueryBuilder("s")
      .where('s."productId" = :p', { p: productId })
      .andWhere('s."userId" = :u', { u: userId })
      .andWhere("s.projectId = :pid", { pid: this.project.id })
      .andWhere("s.quantity = :q", { q: quantity })
      .andWhere("s.price = :pr", { pr: price })
      .andWhere("s.sale_date = :sd", { sd: saleDate });
    if (branchId) qb.andWhere('s."branchId" = :b', { b: branchId });
    else qb.andWhere('s."branchId" IS NULL');
    const existing = await qb.getOne();

    if (existing) {
      this.push({
        row,
        sheet,
        entity: "sale",
        action: "DUPLICATE",
        confidence: "CONFIRMED",
        reason: "identical sale row already exists",
        key,
        ids: { saleId: existing.id, productId, userId },
      });
      return;
    }

    const saved = await repo.save(
      repo.create({
        price,
        quantity,
        total_amount: totalAmount,
        status: "completed",
        sale_date: saleDate,
        productId,
        userId,
        branchId: branchId ?? null,
        projectId: this.project.id,
        isFromOrigin: false,
      }),
    );
    this.push({
      row,
      sheet,
      entity: "sale",
      action: "CREATED",
      confidence: "CONFIRMED",
      key,
      ids: { saleId: saved.id, productId, userId },
    });
  }
}

// ------------------------------------------------------------------ helpers

function norm(v: any): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" || s === "-" ? null : s;
}

function toNum(v: any): number | null {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v: any): boolean | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}

/** Excel cell → 'YYYY-MM-DD'. Handles ISO strings, Date objects and Excel date serials. */
function toISODate(v: any): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const p = (x: number) => String(x).padStart(2, "0");
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const p = (x: number) => String(x).padStart(2, "0");
    return `${d.y}-${p(d.m)}-${p(d.d)}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Excel cell → 'HH:mm:ss'. Handles 'HH:mm[:ss]', 'hh:mm[:ss] AM/PM' and Excel time fractions. */
function toHMS(v: any): string | null {
  if (v == null || v === "-") return null;
  if (typeof v === "number") {
    const total = Math.round(v * 24 * 3600);
    const p = (x: number) => String(x).padStart(2, "0");
    const h = Math.floor(total / 3600) % 24;
    return `${p(h)}:${p(Math.floor((total % 3600) / 60))}:${p(total % 60)}`;
  }
  const s = String(v).trim();
  if (!s || s === "--:--") return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  if (m[4]) {
    const pm = m[4].toLowerCase() === "pm";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
}

/** Saudi wall clock (UTC+3, no DST) → UTC Date for timestamptz columns. */
function riyadhToUtc(date: string, hms: string | null): Date | null {
  if (!hms) return null;
  const d = new Date(`${date}T${hms}+03:00`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Saudi wall clock → Date for NAIVE `timestamp` columns (e.g. sale.sale_date):
 * the wall-clock components are stored as-is (encoded via UTC so the pg driver
 * does not shift them).
 */
function wallClockToTimestamp(date: string, hms: string): Date {
  return new Date(`${date}T${hms}Z`);
}

/** Full URL → app storage path ('/tmp/checkins/...'), passes paths through. */
function urlToPath(v: any): string | null {
  const s = norm(v);
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      return new URL(s).pathname;
    } catch {
      return s;
    }
  }
  return s;
}
