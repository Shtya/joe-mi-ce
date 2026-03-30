import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Between } from "typeorm";
import * as exceljs from "exceljs";
import * as dayjs from "dayjs";
import * as utc from "dayjs/plugin/utc";
import * as timezone from "dayjs/plugin/timezone";
import * as os from "os";

dayjs.extend(utc);
dayjs.extend(timezone);
import * as path from "path";

import { User } from "entities/user.entity";
import { Journey, JourneyStatus } from "entities/all_plans.entity";
import { Sale } from "entities/products/sale.entity";
import { Product } from "entities/products/product.entity";
import { Stock } from "entities/products/stock.entity";
import { Project } from "entities/project.entity";
import { Vacation } from "entities/employee/vacation.entity";
import { VacationDate } from "entities/employee/vacation-date.entity";

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Journey)
    private readonly journeyRepository: Repository<Journey>,
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
    @InjectRepository(Vacation)
    private readonly vacationRepository: Repository<Vacation>,
    @InjectRepository(VacationDate)
    private readonly vacationDateRepository: Repository<VacationDate>,
  ) {}

  async generateMonthlyReport(): Promise<string> {
    this.logger.log("Started generating monthly report...");

    const projectName = "taqnia";
    const project = await this.projectRepository.findOne({
      where: { name: projectName },
    });
    const projectId = project?.id;

    if (!projectId) {
      this.logger.warn(
        `Project "${projectName}" not found. Report might be empty or unfiltered.`,
      );
    }

    const now = dayjs();
    const startOfMonth = now.startOf("month");

    const daysInMonthForAttendance = now.daysInMonth();
    const daysInMonthForSales =
      now.month() === dayjs().month() && now.year() === dayjs().year()
        ? now.date()
        : now.daysInMonth();

    const currentMonthPrefix = now.format("YYYY-MM");
    const endOfReportingPeriod = now.endOf("day");

    const workbook = new exceljs.Workbook();
    workbook.creator = "System Cron";

    const attendanceSheet = workbook.addWorksheet(`Attendance`);
    const tab2Sheet = workbook.addWorksheet(`SAR Entries`);
    const tab3Sheet = workbook.addWorksheet(`Check-in - Check-out`);
    const durationSheet = workbook.addWorksheet(`Attendance Duration`);
    const salesByModelSheet = workbook.addWorksheet(`Sales by Model`);
    const salesDetailSheet = workbook.addWorksheet(`Sales Detail`);

    const baseColumns = [
      { header: "JOE M.I. USER", key: "joe_user_1", width: 15 },
      { header: "No", key: "no", width: 5 },
      { header: "Name", key: "name", width: 25 },
      { header: "Status", key: "user_status", width: 15 },
      { header: "National ID", key: "id", width: 15 },
      { header: "City", key: "city", width: 15 },
      { header: "Channel", key: "channel", width: 15 },
      { header: "Store", key: "store", width: 20 },
    ];

    const dateColumnsForAttendance = [];
    const dateColumnsForSales = [];
    const checkinDateColumns = [];
    const durationDateColumns = [];

    for (let i = 1; i <= daysInMonthForAttendance; i++) {
      const dateStr = `${currentMonthPrefix}-${String(i).padStart(2, "0")}`;
      dateColumnsForAttendance.push({
        header: dateStr,
        key: `day_${i}`,
        width: 15,
      });
      checkinDateColumns.push({ header: `${dateStr} Check-in`, width: 15 });
      checkinDateColumns.push({ header: `${dateStr} Check-out`, width: 15 });

      durationDateColumns.push({
        header: `${dateStr} Duration`,
        key: `duration_${i}`,
        width: 15,
      });
      durationDateColumns.push({
        header: `${dateStr} Shift Count`,
        key: `shift_count_${i}`,
        width: 15,
      });

      if (i <= daysInMonthForSales) {
        dateColumnsForSales.push({
          header: dateStr,
          key: `day_${i}`,
          width: 15,
        });
      }
    }

    attendanceSheet.columns = [
      ...baseColumns,
      ...dateColumnsForAttendance,
      { header: "TLL DAYS", key: "ttl_attendance", width: 15 },
    ];
    tab2Sheet.columns = [
      ...baseColumns,
      ...dateColumnsForSales,
      { header: "TLL DAYS", key: "tll_days_tab2", width: 15 },
    ];
    durationSheet.columns = [
      ...baseColumns,
      ...durationDateColumns,
      { header: "Total Hours", key: "total_hours", width: 15 },
      { header: "Days of Work", key: "days_of_work", width: 15 },
      { header: "Average Duration", key: "avg_duration", width: 18 },
    ];

    // Set widths for Tab 3 and Duration Sheet
    const tab3TotalCols = baseColumns.length + checkinDateColumns.length + 1;
    for (let i = 1; i <= tab3TotalCols; i++) {
      tab3Sheet.getColumn(i).width = 15;
    }
    const durationTotalCols =
      baseColumns.length + durationDateColumns.length + 3;
    for (let i = 1; i <= durationTotalCols; i++) {
      durationSheet.getColumn(i).width = 15;
    }

    let users = await this.userRepository.find({
      where: {
        is_active: true,
        ...(projectId && { project_id: projectId }),
      },
      relations: ["role", "branch", "branch.city", "branch.chain"],
    });
    users = users.filter((u) => u.role?.name?.toLowerCase() === "promoter");

    const journeys = await this.journeyRepository.find({
      where: {
        date: Between(
          startOfMonth.format("YYYY-MM-DD"),
          endOfReportingPeriod.format("YYYY-MM-DD"),
        ),
        ...(projectId && { projectId }),
      },
      relations: ["user", "checkin"],
    });

    const sales = await this.saleRepository.find({
      where: {
        sale_date: Between(
          startOfMonth.toDate(),
          endOfReportingPeriod.toDate(),
        ),
        ...(projectId && { projectId }),
      },
      relations: [
        "user",
        "user.role",
        "product",
        "product.brand",
        "product.category",
        "branch",
        "branch.chain",
      ],
    });

    const vacations = await this.vacationRepository.find({
      where: {
        overall_status: "approved",
        ...(projectId && { branch: { project: { id: projectId } } }),
      },
      relations: ["user", "vacationDates"],
    });

    const isRoaming = (name: string) => /roam|roma/i.test(name || "");
    const isPromoter = (user: any) =>
      user?.role?.name?.toLowerCase() === "promoter";

    const journeysByUser: Record<string, Journey[]> = {};
    journeys.forEach((j) => {
      const uid = j.user?.id;
      if (uid) {
        if (!journeysByUser[uid]) journeysByUser[uid] = [];
        journeysByUser[uid].push(j);
      }
    });

    const salesByUser: Record<string, Sale[]> = {};
    sales.forEach((s) => {
      const uid = s.user?.id;
      if (uid) {
        if (!salesByUser[uid]) salesByUser[uid] = [];
        salesByUser[uid].push(s);
      }
    });

    const vacationsByUser: Record<string, Set<string>> = {};
    vacations.forEach((v) => {
      const uid = v.user?.id;
      if (uid) {
        if (!vacationsByUser[uid]) vacationsByUser[uid] = new Set();
        v.vacationDates.forEach((vd) => vacationsByUser[uid].add(vd.date));
      }
    });

    const dailyAttendanceTotals: Record<string, number> = {};
    for (let i = 1; i <= daysInMonthForAttendance; i++) {
      dailyAttendanceTotals[`day_${i}`] = 0;
    }

    const attendanceRows: any[] = [];
    const tab2Rows: any[] = [];
    const tab3Rows: any[] = [];
    const durationRows: any[] = [];

    const formatDuration = (ms: number) => {
      if (!ms || ms <= 0) return "00:00";
      const totalMinutes = Math.floor(ms / (1000 * 60));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    };

    let rowNo = 1;
    for (const user of users) {
      if (!isPromoter(user)) continue;

      const userJourneys = journeysByUser[user.id] || [];
      const userSales = salesByUser[user.id] || [];
      const userVacationDates = vacationsByUser[user.id] || new Set<string>();

      let effectiveBranch = user.branch;
      if (!effectiveBranch && userJourneys.length > 0) {
        const sorted = [...userJourneys].sort((a, b) =>
          b.date.localeCompare(a.date),
        );
        const lastWithBranch = sorted.find((j) => j.branch);
        if (lastWithBranch) {
          effectiveBranch = lastWithBranch.branch;
        }
      }

      const chainName = effectiveBranch?.chain?.name || "N/A";
      if (isRoaming(chainName)) continue;

      const baseRowData = {
        joe_user_1: user.username,
        no: rowNo++,
        name: user.name,
        user_status: user.is_active ? "Active" : "Not Active",
        id: user.national_id,
        city: effectiveBranch?.city?.name || "N/A",
        channel: chainName,
        store: effectiveBranch?.name || "N/A",
      };

      const attRow = { ...baseRowData };
      const t2Row = { ...baseRowData };
      const t3RowArr = [
        baseRowData.joe_user_1,
        baseRowData.no,
        baseRowData.name,
        baseRowData.user_status,
        baseRowData.id,
        baseRowData.city,
        baseRowData.channel,
        baseRowData.store,
      ];
      const durationRow = { ...baseRowData };

      let ttlDays = 0;
      let ttlAttendance = 0;
      let totalSales = 0;
      let totalDurationMs = 0;
      let daysOfWork = 0;

      for (let i = 1; i <= daysInMonthForAttendance; i++) {
        const currentDateStr = `${currentMonthPrefix}-${String(i).padStart(2, "0")}`;
        const dayKey = `day_${i}`;

        const isPastReportingPeriod = dayjs(currentDateStr).isAfter(
          endOfReportingPeriod,
          "day",
        );

        if (userVacationDates.has(currentDateStr)) {
          attRow[dayKey] = "Vacation";
          t3RowArr.push("Vacation");
          t3RowArr.push("Vacation");
          durationRow[`duration_${i}`] = "Vacation";
          durationRow[`shift_count_${i}`] = "Vacation";
          if (i <= daysInMonthForSales) t2Row[dayKey] = "";
          continue;
        }

        const dayJourneys = userJourneys.filter(
          (j) => j.date === currentDateStr,
        );

        if (dayJourneys.length > 0) {
          const hasPresent = dayJourneys.some((j) =>
            [
              JourneyStatus.PRESENT,
              JourneyStatus.CLOSED,
              JourneyStatus.UNPLANNED_PRESENT,
              JourneyStatus.UNPLANNED_CLOSED,
            ].includes(j.status as any),
          );
          const hasAbsent = dayJourneys.some((j) =>
            [JourneyStatus.ABSENT, JourneyStatus.UNPLANNED_ABSENT].includes(
              j.status as any,
            ),
          );

          if (hasPresent) {
            attRow[dayKey] = 1;
            dailyAttendanceTotals[dayKey] += 1;
            ttlAttendance += 1;
            ttlDays += 1;
          } else if (hasAbsent) {
            attRow[dayKey] = 0;
          } else {
            attRow[dayKey] = "";
          }
        } else {
          attRow[dayKey] = isPastReportingPeriod ? "" : user.is_active ? 0 : "";
        }

        if (dayJourneys.length > 0) {
          const inTimes = dayJourneys
            .map((j) =>
              j.checkin?.checkInTime
                ? dayjs(j.checkin.checkInTime).add(3, "hour").format("HH:mm")
                : "",
            )
            .filter(Boolean);
          const outTimes = dayJourneys
            .map((j) =>
              j.checkin?.checkOutTime
                ? dayjs(j.checkin.checkOutTime).add(3, "hour").format("HH:mm")
                : "",
            )
            .filter(Boolean);

          t3RowArr.push(inTimes.length > 0 ? inTimes.join(" , ") : "--:--");
          t3RowArr.push(outTimes.length > 0 ? outTimes.join(" , ") : "--:--");
        } else {
          t3RowArr.push(
            isPastReportingPeriod ? "" : user.is_active ? "--:--" : "",
          );
          t3RowArr.push(
            isPastReportingPeriod ? "" : user.is_active ? "--:--" : "",
          );
          durationRow[`duration_${i}`] = isPastReportingPeriod
            ? ""
            : user.is_active
              ? "00:00"
              : "";
          durationRow[`shift_count_${i}`] = isPastReportingPeriod
            ? ""
            : user.is_active
              ? 0
              : "";
        }

        // Calculate daily duration sum
        if (dayJourneys.length > 0) {
          let dayDurationMs = 0;
          dayJourneys.forEach((j) => {
            if (j.checkin?.checkInTime && j.checkin?.checkOutTime) {
              const start = dayjs(j.checkin.checkInTime);
              const end = dayjs(j.checkin.checkOutTime);
              if (end.isAfter(start)) {
                dayDurationMs += end.diff(start);
              }
            }
          });
          durationRow[`duration_${i}`] = formatDuration(dayDurationMs);
          durationRow[`shift_count_${i}`] = dayJourneys.length;
          totalDurationMs += dayDurationMs;
          daysOfWork++;
        }

        if (i <= daysInMonthForSales) {
          const daySales = userSales.filter(
            (s) => dayjs(s.sale_date).format("YYYY-MM-DD") === currentDateStr,
          );
          const dailySalesTotal = daySales.reduce(
            (sum, sale) => sum + Number(sale.total_amount || 0),
            0,
          );

          t2Row[dayKey] = dailySalesTotal > 0 ? `${dailySalesTotal}` : "";
          totalSales += dailySalesTotal;
        }
      }

      attRow["ttl_attendance"] = ttlAttendance;
      t2Row["tll_days_tab2"] = totalSales > 0 ? `${totalSales}` : "";
      t3RowArr.push(ttlDays);

      attendanceRows.push(attRow);
      tab2Rows.push(t2Row);
      tab3Rows.push(t3RowArr);

      durationRow["total_hours"] = formatDuration(totalDurationMs);
      durationRow["days_of_work"] = daysOfWork;
      const avgMs = daysOfWork > 0 ? totalDurationMs / daysOfWork : 0;
      durationRow["avg_duration"] = formatDuration(avgMs);
      durationRows.push(durationRow);
    }

    const totalsRowData: Record<string, any> = {
      joe_user_1: "Total",
      name: "Total",
      user_status: "",
    };
    let totalOfTotals = 0;
    for (let i = 1; i <= daysInMonthForAttendance; i++) {
      const key = `day_${i}`;
      totalsRowData[key] = dailyAttendanceTotals[key];
      totalOfTotals += dailyAttendanceTotals[key];
    }
    totalsRowData["ttl_attendance"] = totalOfTotals;

    attendanceSheet.addRow(totalsRowData);
    attendanceRows.forEach((r) => attendanceSheet.addRow(r));

    tab2Rows.forEach((r) => tab2Sheet.addRow(r));

    const headerRow1 = tab3Sheet.getRow(1);
    const headerRow2 = tab3Sheet.getRow(2);

    baseColumns.forEach((col, index) => {
      const cell = headerRow1.getCell(index + 1);
      cell.value = col.header;
      tab3Sheet.mergeCells(1, index + 1, 2, index + 1);
    });

    let currentColIndex = baseColumns.length + 1;
    for (let i = 1; i <= daysInMonthForAttendance; i++) {
      const dateStr = `${currentMonthPrefix}-${String(i).padStart(2, "0")}`;

      const dateCell = headerRow1.getCell(currentColIndex);
      dateCell.value = dateStr;
      tab3Sheet.mergeCells(1, currentColIndex, 1, currentColIndex + 1);

      headerRow2.getCell(currentColIndex).value = "Check-in";
      headerRow2.getCell(currentColIndex + 1).value = "Check-out";
      currentColIndex += 2;
    }

    const tllDaysCell = headerRow1.getCell(currentColIndex);
    tllDaysCell.value = "TLL DAYS";
    tab3Sheet.mergeCells(1, currentColIndex, 2, currentColIndex);

    tab3Rows.forEach((r) => {
      tab3Sheet.addRow(r);
    });

    durationRows.forEach((r) => {
      durationSheet.addRow(r);
    });

    // Merging Headers for Tab 3 and Duration Sheet
    const headerRow1_t3 = tab3Sheet.getRow(1);
    const headerRow2_t3 = tab3Sheet.getRow(2);
    const headerRow1_dur = durationSheet.getRow(1);
    const headerRow2_dur = durationSheet.getRow(2);

    baseColumns.forEach((col, index) => {
      // Tab 3
      const cell_t3 = headerRow1_t3.getCell(index + 1);
      cell_t3.value = col.header;
      tab3Sheet.mergeCells(1, index + 1, 2, index + 1);

      // Duration Sheet
      const cell_dur = headerRow1_dur.getCell(index + 1);
      cell_dur.value = col.header;
      durationSheet.mergeCells(1, index + 1, 2, index + 1);
    });

    let currentColIndex_t3 = baseColumns.length + 1;
    let currentColIndex_dur = baseColumns.length + 1;

    for (let i = 1; i <= daysInMonthForAttendance; i++) {
      const dateStr = `${currentMonthPrefix}-${String(i).padStart(2, "0")}`;

      // Tab 3
      const dateCell_t3 = headerRow1_t3.getCell(currentColIndex_t3);
      dateCell_t3.value = dateStr;
      tab3Sheet.mergeCells(1, currentColIndex_t3, 1, currentColIndex_t3 + 1);
      headerRow2_t3.getCell(currentColIndex_t3).value = "Check-in";
      headerRow2_t3.getCell(currentColIndex_t3 + 1).value = "Check-out";
      currentColIndex_t3 += 2;

      // Duration Sheet
      const dateCell_dur = headerRow1_dur.getCell(currentColIndex_dur);
      dateCell_dur.value = dateStr;
      durationSheet.mergeCells(
        1,
        currentColIndex_dur,
        1,
        currentColIndex_dur + 1,
      );
      headerRow2_dur.getCell(currentColIndex_dur).value = "Duration";
      headerRow2_dur.getCell(currentColIndex_dur + 1).value = "Shift Count";
      currentColIndex_dur += 2;
    }

    // Totals columns for Tab 3
    const tllDaysCell_t3 = headerRow1_t3.getCell(currentColIndex_t3);
    tllDaysCell_t3.value = "TLL DAYS";
    tab3Sheet.mergeCells(1, currentColIndex_t3, 2, currentColIndex_t3);

    // Totals columns for Duration Sheet
    const totalHoursCell = headerRow1_dur.getCell(currentColIndex_dur);
    totalHoursCell.value = "Total Hours";
    durationSheet.mergeCells(1, currentColIndex_dur, 2, currentColIndex_dur);

    const daysOfWorkCell = headerRow1_dur.getCell(currentColIndex_dur + 1);
    daysOfWorkCell.value = "Days of Work";
    durationSheet.mergeCells(
      1,
      currentColIndex_dur + 1,
      2,
      currentColIndex_dur + 1,
    );

    const avgDurationCell = headerRow1_dur.getCell(currentColIndex_dur + 2);
    avgDurationCell.value = "Average Duration";
    durationSheet.mergeCells(
      1,
      currentColIndex_dur + 2,
      2,
      currentColIndex_dur + 2,
    );

    // --- Sales by Model Tab ---
    const salesModelBaseColumns = [
      { header: "Brand", key: "brand", width: 20 },
      { header: "Category", key: "category", width: 20 },
      { header: "Model", key: "model", width: 20 },
      { header: "SKU", key: "sku", width: 20 },
      { header: "Product Name", key: "name", width: 30 },
    ];

    const salesModelDateColumns = [];
    for (let i = 1; i <= daysInMonthForSales; i++) {
      const dateStr = `${currentMonthPrefix}-${String(i).padStart(2, "0")}`;
      salesModelDateColumns.push({
        header: dateStr,
        key: `day_${i}`,
        width: 15,
      });
    }

    salesByModelSheet.columns = [
      ...salesModelBaseColumns,
      ...salesModelDateColumns,
      { header: "Total Quantity", key: "quantity", width: 15 },
      { header: "Total Amount", key: "total_amount", width: 20 },
      { header: "Last Sale Date", key: "last_sale_date", width: 20 },
    ];

    const modelSalesMap = new Map<string, any>();
    sales.forEach((s) => {
      if (!isPromoter(s.user)) return;
      if (isRoaming(s.branch?.chain?.name)) return;

      const model = s.product?.model || "N/A";
      const sku = s.product?.sku || "N/A";
      const key = `${model}_${sku}`;
      const saleDate = dayjs(s.sale_date);
      const dayOfMonth = saleDate.date();

      if (!modelSalesMap.has(key)) {
        const initialData = {
          brand: s.product?.brand?.name || "N/A",
          category: s.product?.category?.name || "N/A",
          model: model,
          sku: sku,
          name: s.product?.name || "N/A",
          quantity: 0,
          total_amount: 0,
          last_sale_date: null,
        };
        for (let i = 1; i <= daysInMonthForSales; i++) {
          initialData[`day_${i}`] = 0;
        }
        modelSalesMap.set(key, initialData);
      }

      const entry = modelSalesMap.get(key);

      // Update daily quantity
      if (dayOfMonth <= daysInMonthForSales) {
        entry[`day_${dayOfMonth}`] += Number(s.quantity || 0);
      }

      // Update totals
      entry.quantity += Number(s.quantity || 0);
      entry.total_amount += Number(s.total_amount || 0);

      // Update Last Sale Date
      if (
        !entry.last_sale_date ||
        saleDate.isAfter(dayjs(entry.last_sale_date))
      ) {
        entry.last_sale_date = saleDate.format("YYYY-MM-DD HH:mm");
      }
    });

    modelSalesMap.forEach((value) => {
      salesByModelSheet.addRow({
        ...value,
        total_amount: `${value.total_amount.toFixed(2)}`,
        last_sale_date: value.last_sale_date || "N/A",
      });
    });

    // --- Sales Detail Tab ---
    salesDetailSheet.columns = [
      { header: "User Name", key: "user_name", width: 25 },
      { header: "User Username", key: "user_username", width: 25 },
      { header: "User Mobile", key: "user_mobile", width: 15 },
      { header: "City Name", key: "city_name", width: 15 },
      { header: "Chain", key: "chain", width: 15 },
      { header: "Branch", key: "branch", width: 20 },
      { header: "Brand", key: "brand", width: 15 },
      { header: "Categories", key: "categories", width: 15 },
      { header: "Product Model", key: "product_model", width: 20 },
      { header: "Price", key: "price", width: 10 },
      { header: "Total Amount", key: "total_amount", width: 15 },
      { header: "Quantity", key: "quantity", width: 10 },
      { header: "Date of Sale", key: "date_of_sale", width: 15 },
      { header: "Time of Sale", key: "time_of_sale", width: 10 },
    ];

    // Sort sales by date and time (ascending)
    const sortedSales = [...sales].sort((a, b) => {
      const dateA = dayjs(a.sale_date);
      const dateB = dayjs(b.sale_date);
      return dateA.diff(dateB);
    });

    sortedSales.forEach((s) => {
      if (!isPromoter(s.user)) return;
      if (isRoaming(s.branch?.chain?.name)) return;

      const saleDate = dayjs(s.sale_date);

      salesDetailSheet.addRow({
        user_name: s.user?.name || "-",
        user_username: s.user?.username || "-",
        user_mobile: s.user?.mobile || "-",
        city_name: s.branch?.city?.name || "-",
        chain: s.branch?.chain?.name || "-",
        branch: s.branch?.name || "-",
        brand: s.product?.brand?.name || "-",
        categories: s.product?.category?.name || "-",
        product_model: s.product?.model || s.product?.name || "-",
        price: s.price ?? "-",
        total_amount: s.total_amount ?? "-",
        quantity: s.quantity ?? "-",
        date_of_sale: saleDate.format("YYYY-MM-DD"),
        time_of_sale: saleDate.format("HH:mm:ss"),
      });
    });

    // Formatting
    const headerFill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEBF1DE" },
    };
    const headerDateFont = { bold: true, color: { argb: "FFFF0000" } };
    const standardHeaderFont = { bold: true, color: { argb: "FF000000" } };

    const cellBorder = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };

    const thickBottomBorder = {
      ...cellBorder,
      bottom: { style: "thick", color: { argb: "FF000000" } },
    };

    [
      attendanceSheet,
      tab2Sheet,
      tab3Sheet,
      durationSheet,
      salesByModelSheet,
      salesDetailSheet,
    ].forEach((sheet) => {
      const isTab3 = sheet.name === "Check-in - Check-out";
      const isSalesByModel = sheet.name === "Sales by Model";
      const isSalesDetail = sheet.name === "Sales Detail";
      const isAttendance = sheet.name === "Attendance";

      let effectiveBaseColCount = baseColumns.length;
      if (isSalesByModel) effectiveBaseColCount = 5;
      if (isSalesDetail) effectiveBaseColCount = 0;
      if (
        sheet.name === "Attendance Duration" ||
        sheet.name === "Check-in - Check-out"
      ) {
        effectiveBaseColCount = baseColumns.length;
      }

      const startRow = isTab3 || sheet.name === "Attendance Duration" ? 2 : 1;

      if (sheet.rowCount > startRow && sheet.columnCount > 0) {
        sheet.autoFilter = {
          from: { row: startRow, column: 1 },
          to: { row: sheet.rowCount, column: sheet.columnCount },
        };
      }

      // Freeze headers (and totals row for Attendance)
      sheet.views = [
        { state: "frozen", xSplit: 0, ySplit: isAttendance ? 2 : startRow },
      ];

      sheet.eachRow((row, rowNumber) => {
        const isHeader = isTab3 ? rowNumber <= 2 : rowNumber === 1;
        const isTotalRow = isAttendance && rowNumber === 2;

        row.eachCell((cell, colNumber) => {
          cell.alignment = { vertical: "middle", horizontal: "center" };

          if (isHeader) {
            if (
              colNumber > effectiveBaseColCount &&
              colNumber < sheet.columnCount
            ) {
              cell.font = headerDateFont;
            } else {
              cell.font = standardHeaderFont;
            }
            cell.fill = headerFill as exceljs.Fill;
            cell.border = cellBorder as Partial<exceljs.Borders>;
          } else if (isTotalRow) {
            cell.font = { bold: true };
            cell.border = thickBottomBorder as Partial<exceljs.Borders>;
          } else {
            cell.border = cellBorder as Partial<exceljs.Borders>;
          }
        });
      });
    });

    const executionDateStr = now.format("YYYY_MM_DD");
    const filename = `monthly_report_${executionDateStr}.xlsx`;
    const tempFilePath = path.join(os.tmpdir(), filename);

    await workbook.xlsx.writeFile(tempFilePath);
    this.logger.log(`Monthly report successfully generated at ${tempFilePath}`);

    return tempFilePath;
  }

  async generateGatemeaReport(): Promise<string> {
    this.logger.log("Started generating GATEMEA Daily report...");

    const projectName = "gatemea";
    const project = await this.projectRepository.findOne({
      where: { name: projectName },
      relations: ["chains"],
    });
    const projectId = project?.id;

    if (!projectId) {
      this.logger.warn(
        `Project "${projectName}" not found. Gatemea report cannot be generated.`,
      );
      return null;
    }

    const now = dayjs().tz("Asia/Riyadh");
    const yesterday = now.clone().subtract(1, "day");

    // Custom Reporting Period: 7 AM Yesterday to 5 AM Today (Saudi Time)
    const reportStart = yesterday
      .clone()
      .set("hour", 7)
      .set("minute", 0)
      .set("second", 0)
      .set("millisecond", 0);
    const reportEnd = now
      .clone()
      .set("hour", 5)
      .set("minute", 0)
      .set("second", 0)
      .set("millisecond", 0);

    this.logger.log(
      `Gatemea Report Range (Saudi Time): ${reportStart.format()} to ${reportEnd.format()}`,
    );
    this.logger.log(
      `Gatemea Query UTC Range: ${reportStart.toDate().toISOString()} to ${reportEnd.toDate().toISOString()}`,
    );

    const workbook = new exceljs.Workbook();
    workbook.creator = "System SixSeven";

    const reportSheet = workbook.addWorksheet(`SixSeven Report`);

    // Pivot Table Styling Tokens
    const headerPattern = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E1F2" },
    } as const;
    const borderObj = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    } as const;

    // 1. Fetch Sales, Products & Journeys for Custom Period
    const [sales, products, journeys, stocks] = await Promise.all([
      this.saleRepository.find({
        where: {
          sale_date: Between(reportStart.toDate(), reportEnd.toDate()),
          projectId: projectId,
        },
        relations: ["product", "branch", "branch.chain", "user", "user.role"],
      }),
      this.productRepository.find({
        where: { project_id: projectId, is_active: true },
      }),
      this.journeyRepository.find({
        where: [
          { date: yesterday.format("YYYY-MM-DD"), projectId: projectId },
          { date: now.format("YYYY-MM-DD"), projectId: projectId },
        ],
        relations: ["user", "user.role", "branch", "branch.chain", "checkin"],
      }),
      this.stockRepository.find({
        where: { product: { project_id: projectId, is_active: true } },
        relations: ["branch", "branch.chain", "product"],
      }),
    ]);

    this.logger.log(
      `Fetched Data: ${sales.length} sales, ${products.length} products, ${journeys.length} journeys, ${stocks.length} stock records for Project ID ${projectId}`,
    );

    const isRoaming = (name: string) => /roam|roma/i.test(name);
    // Relaxed isPromoter check if needed, but keeping it as a check for specific logic
    // const isPromoter = (user: any) => {
    //   const roleName = user?.role?.name?.toLowerCase();
    //   // Relaxing filter to include multiple relevant roles if "promoter" is too strict
    //   return ["promoter", "supervisor", "admin"].includes(roleName);
    // };

    const chainsSet = new Set<string>();
    (project.chains || []).forEach((c) => {
      const name = c.name?.trim();
      if (name && !isRoaming(name)) chainsSet.add(name);
    });

    const salesMatrix: Record<string, Record<string, number>> = {};
    const productNamesSet = new Set<string>();

    // Pre-populate product names from project products
    products.forEach((p) => {
      const displayName =
        p.name?.trim() || p.model?.trim() || "Unknown Product";
      productNamesSet.add(displayName);
      if (!salesMatrix[displayName]) salesMatrix[displayName] = {};
    });

    sales.forEach((sale) => {
      const chainName = sale.branch?.chain?.name?.trim() || "Extra";
      if (isRoaming(chainName)) return;

      const displayName =
        sale.product?.name?.trim() ||
        sale.product?.model?.trim() ||
        "Unknown Product";
      productNamesSet.add(displayName);
      chainsSet.add(chainName);

      if (!salesMatrix[displayName]) salesMatrix[displayName] = {};
      salesMatrix[displayName][chainName] =
        (salesMatrix[displayName][chainName] || 0) + Number(sale.quantity || 0);
    });
    const sortedProductNames = Array.from(productNamesSet).sort();

    const attendanceMap: Record<string, Set<string>> = {};
    // const yesterdayStr = yesterday.format("YYYY-MM-DD");
    journeys.forEach((j) => {
      const chainName = j.branch?.chain?.name?.trim() || "Extra";
      if (isRoaming(chainName)) return;

      // Time-based filtering for accurate shift reporting
      const checkinTime = j.checkin?.checkInTime;
      if (checkinTime) {
        const cjs = dayjs(checkinTime).tz("Asia/Riyadh");
        if (cjs.isBefore(reportStart) || cjs.isAfter(reportEnd)) return;
      } else {
        // Fallback for journeys without check-in records: only include if they are from yesterday (Saudi date)
        if (j.date !== yesterday.format("YYYY-MM-DD")) return;
      }

      chainsSet.add(chainName);
      const statusStr = j.status?.toLowerCase?.() || "";

      // Using Enum-aligned identification for attendance
      const isPresentStatus = [
        "present",
        "closed",
        "unplanned_present",
        "unplanned_closed",
        JourneyStatus.PRESENT,
        JourneyStatus.CLOSED,
        JourneyStatus.UNPLANNED_PRESENT,
        JourneyStatus.UNPLANNED_CLOSED,
      ].includes(statusStr as any);

      if (isPresentStatus) {
        const key = j.user?.id || j.id;
        if (!attendanceMap[chainName]) attendanceMap[chainName] = new Set();
        attendanceMap[chainName].add(key);
      }
    });

    const chainNames = Array.from(chainsSet).sort();

    // 4. Writing Table 1 (Sales)
    reportSheet.getColumn(1).width = 30;
    chainNames.forEach((_, idx) => (reportSheet.getColumn(idx + 2).width = 12));
    reportSheet.getColumn(chainNames.length + 2).width = 15;

    // Header A1 and B1
    reportSheet.getCell(1, 1).value = "Sum of Quantity";
    reportSheet.getCell(1, 2).value = "Column Labels";
    reportSheet.getCell(1, 1).font = { bold: true };
    reportSheet.getCell(1, 2).font = { bold: true };
    reportSheet.getCell(1, 1).fill = headerPattern;
    reportSheet.getCell(1, 2).fill = headerPattern;
    reportSheet.getCell(1, 1).border = borderObj;
    reportSheet.getCell(1, 2).border = borderObj;
    reportSheet.getCell(1, 1).alignment = { horizontal: "center" };
    reportSheet.getCell(1, 2).alignment = { horizontal: "center" };

    const salesHeadRow = reportSheet.getRow(2);
    salesHeadRow.getCell(1).value = "Row Labels";
    chainNames.forEach(
      (name, idx) => (salesHeadRow.getCell(idx + 2).value = name),
    );
    salesHeadRow.getCell(chainNames.length + 2).value = "Grand Total";

    let currentRow = 3;
    const totalSalesByChain: Record<string, number> = {};
    chainNames.forEach((c) => (totalSalesByChain[c] = 0));
    let absoluteGrandTotalSales = 0;

    sortedProductNames.forEach((product) => {
      const row = reportSheet.getRow(currentRow);
      row.getCell(1).value = product;
      let rowTotal = 0;
      chainNames.forEach((chain, idx) => {
        const qty = salesMatrix[product][chain] || 0;
        if (qty > 0) {
          row.getCell(idx + 2).value = qty;
        }
        rowTotal += qty;
        totalSalesByChain[chain] += qty;
      });
      row.getCell(chainNames.length + 2).value = rowTotal;
      absoluteGrandTotalSales += rowTotal;
      currentRow++;
    });

    // Grand Total Row Sales
    const salesTotalRow = reportSheet.getRow(currentRow);
    salesTotalRow.getCell(1).value = "Grand Total";
    chainNames.forEach(
      (chain, idx) =>
        (salesTotalRow.getCell(idx + 2).value = totalSalesByChain[chain]),
    );
    salesTotalRow.getCell(chainNames.length + 2).value =
      absoluteGrandTotalSales;

    // 5. Writing Table 2 (Attendance)
    const attStartCol = chainNames.length + 4; // leave blank column
    reportSheet.getColumn(attStartCol).width = 15;
    reportSheet.getColumn(attStartCol + 1).width = 20;

    const attHeadRow = reportSheet.getRow(2);
    attHeadRow.getCell(attStartCol).value = "Row Labels";
    attHeadRow.getCell(attStartCol + 1).value = "Sum of Status Code";

    let attInnerRow = 3;
    let totalAtt = 0;
    chainNames.forEach((chain) => {
      const count = attendanceMap[chain]?.size || 0;
      const excelRow = reportSheet.getRow(attInnerRow);
      excelRow.getCell(attStartCol).value = chain;
      excelRow.getCell(attStartCol + 1).value = count;
      totalAtt += count;
      attInnerRow++;
    });

    const attTotalRow = reportSheet.getRow(attInnerRow);
    attTotalRow.getCell(attStartCol).value = "Grand Total";
    attTotalRow.getCell(attStartCol + 1).value = totalAtt;

    // 6. Final Styling Application
    // Apply styling to Table 1 Data area
    for (let r = 2; r <= currentRow; r++) {
      const row = reportSheet.getRow(r);
      for (let c = 1; c <= chainNames.length + 2; c++) {
        const cell = row.getCell(c);
        if (cell.value !== null && cell.value !== undefined) {
          cell.border = borderObj;
          cell.alignment = { horizontal: "center" };
        } else if (c > 1) {
          // Apply border to blank cells in table
          cell.border = borderObj;
        }

        if (r === 2 || r === currentRow) {
          cell.font = { bold: true };
          cell.fill = headerPattern;
          cell.border = borderObj;
        }
      }
    }

    // Apply styling to Table 2 Data area
    for (let r = 2; r <= attInnerRow; r++) {
      const row = reportSheet.getRow(r);
      for (let c = attStartCol; c <= attStartCol + 1; c++) {
        const cell = row.getCell(c);
        cell.border = borderObj;
        cell.alignment = { horizontal: "center" };
        if (r === 2 || r === attInnerRow) {
          cell.font = { bold: true };
          cell.fill = headerPattern;
        }
      }
    }

    // 7. Writing Table 3 (Stock)
    const stockSheet = workbook.addWorksheet("Stock");
    const outOfStockSheet = workbook.addWorksheet("Out of Stock");

    // Matrix for Stock: [ProductName][BranchName]
    const stockMatrix: Record<string, Record<string, number>> = {};
    const branchesSet = new Set<string>();

    stocks.forEach((s) => {
      const bName = s.branch?.name?.trim() || "Unknown Branch";
      const pName =
        s.product?.name?.trim() ||
        s.product?.model?.trim() ||
        "Unknown Product";
      branchesSet.add(bName);
      if (!stockMatrix[pName]) stockMatrix[pName] = {};
      stockMatrix[pName][bName] = Number(s.quantity || 0);
    });

    const sortedBranches = Array.from(branchesSet).sort();

    // Setup Stock Header
    stockSheet.getColumn(1).width = 30;
    sortedBranches.forEach(
      (_, idx) => (stockSheet.getColumn(idx + 2).width = 15),
    );

    const stockHeadRow = stockSheet.getRow(1);
    stockHeadRow.getCell(1).value = "Product / Branch";
    sortedBranches.forEach(
      (b, idx) => (stockHeadRow.getCell(idx + 2).value = b),
    );
    stockHeadRow.font = { bold: true };
    stockHeadRow.fill = headerPattern;

    let stockRowIdx = 2;
    sortedProductNames.forEach((p) => {
      const row = stockSheet.getRow(stockRowIdx++);
      row.getCell(1).value = p;
      sortedBranches.forEach((b, idx) => {
        const qty = stockMatrix[p]?.[b] || 0;
        row.getCell(idx + 2).value = qty;
        row.getCell(idx + 2).border = borderObj;
        row.getCell(idx + 2).alignment = { horizontal: "center" };
      });
      row.getCell(1).border = borderObj;
    });
    stockHeadRow.eachCell((c) => (c.border = borderObj));

    // 8. Writing Table 4 (Out of Stock)
    // Setup Out of Stock Matrix (only for items <= 0)
    const oosMatrix: Record<string, Record<string, number>> = {};
    const oosBranchesSet = new Set<string>();
    const oosProductsSet = new Set<string>();

    stocks
      .filter((s) => Number(s.quantity || 0) <= 0)
      .forEach((s) => {
        const bName = s.branch?.name?.trim() || "Unknown Branch";
        const pName =
          s.product?.name?.trim() ||
          s.product?.model?.trim() ||
          "Unknown Product";
        oosBranchesSet.add(bName);
        oosProductsSet.add(pName);
        if (!oosMatrix[pName]) oosMatrix[pName] = {};
        oosMatrix[pName][bName] = Number(s.quantity || 0);
      });

    const sortedOosBranches = Array.from(oosBranchesSet).sort();
    const sortedOosProducts = Array.from(oosProductsSet).sort();

    outOfStockSheet.getColumn(1).width = 30;
    sortedOosBranches.forEach(
      (_, idx) => (outOfStockSheet.getColumn(idx + 2).width = 15),
    );

    const oosHeadRow = outOfStockSheet.getRow(1);
    oosHeadRow.getCell(1).value = "Product / Branch (OOS)";
    sortedOosBranches.forEach(
      (b, idx) => (oosHeadRow.getCell(idx + 2).value = b),
    );
    oosHeadRow.font = { bold: true };
    oosHeadRow.fill = headerPattern;
    oosHeadRow.eachCell((c) => {
      c.border = borderObj;
      c.alignment = { horizontal: "center" };
    });

    let oosRowIdx = 2;
    sortedOosProducts.forEach((p) => {
      const row = outOfStockSheet.getRow(oosRowIdx++);
      row.getCell(1).value = p;
      sortedOosBranches.forEach((b, idx) => {
        const qty = oosMatrix[p]?.[b];
        // Only show if it was part of the filtered out-of-stock list
        if (qty !== undefined) {
          row.getCell(idx + 2).value = qty;
        } else {
          row.getCell(idx + 2).value = "-"; // Not OOS at this branch
        }
        row.getCell(idx + 2).border = borderObj;
        row.getCell(idx + 2).alignment = { horizontal: "center" };
      });
      row.getCell(1).border = borderObj;
    });

    const executionDateStr = yesterday.format("YYYY_MM_DD");
    const filename = `gatemea_report_6_7_${executionDateStr}.xlsx`;
    const tempFilePath = path.join(os.tmpdir(), filename);

    await workbook.xlsx.writeFile(tempFilePath);
    this.logger.log(
      `Gatemea SixSeven report successfully generated at ${tempFilePath}`,
    );

    return tempFilePath;
  }
}
