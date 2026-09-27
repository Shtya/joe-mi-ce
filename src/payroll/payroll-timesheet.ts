import * as ExcelJS from "exceljs";
import { roundMoney } from "./payroll-calculator";

export type TimeSheetSymbol = "1" | "0" | "V" | "R" | "N";
export type TimeSheetAttendanceKind =
  | "present"
  | "weekly_off"
  | "late"
  | "absent"
  | "vacation"
  | "resigned"
  | "new_promoter";
export interface TimeSheetAttendance {
  workDate: string;
  present?: boolean;
  vacation?: boolean;
  weeklyOff?: boolean;
  lateMinutes?: number;
}
export interface TimeSheetEmployee {
  userId: string;
  identity: string;
  name: string;
  mobile?: string;
  nationality?: string;
  region?: string;
  city?: string;
  chain?: string;
  store?: string;
  bankAccount?: string;
  bankName?: string;
  sponsorship?: string;
  monthlySalary: number;
  attendance: TimeSheetAttendance[];
  overrides?: Array<{
    workDate: string;
    symbol: string;
    paidShiftUnits?: number | string;
    attendanceKind?: TimeSheetAttendanceKind;
  }>;
  overtime: Array<{
    workDate: string;
    overtimeMinutes: number;
    amount: number;
  }>;
  deduction?: number;
  manualBonus?: number;
  netPay?: number;
}
export interface OverTimeSheetInput {
  projectId: string;
  period: { id: string; month: string; startDate: string; endDate: string };
  throughDate: string;
  employees: TimeSheetEmployee[];
}
export interface ParsedTimeSheet {
  rows: Array<{
    userId: string;
    workDate: string;
    symbol: TimeSheetSymbol;
    paidShiftUnits: number;
    attendanceKind: TimeSheetAttendanceKind;
  }>;
  employees: Array<{
    userId: string;
    name: string;
    mobile: string;
    nationality: string;
    monthlySalary: number;
    bankAccount: string;
    bankName: string;
    sponsorship: string;
  }>;
  rejectedRows: Array<{ rowNumber: number; reason: string }>;
}

const VERSION = "overtime-timesheet-v1";
const IDENTITY_HEADERS = [
  "Iqama",
  "Name",
  "Mobile ",
  "Nationality",
  "Region",
  "City",
  "Chain ",
  "Store",
  "Basic Salary",
  "Bank Acount ",
  "Bank Name",
  "Sponsership ",
];
const SUMMARY_HEADERS = [
  "Paid Days",
  "Daily Rate",
  "Calculated Salary",
  "Deduction",
  "Bonus",
  "Final Salary",
  "Lateness",
];
const DB_WIDTHS = [
  11.6640625, 25.33203125, 12.5, 13.6640625, 10, 14.6640625, 9.5, 8.5,
  14.33203125, 27.1640625, 15.33203125, 21,
];
const PERIOD_WIDTHS = [
  11.6640625, 25.33203125, 31.33203125, 13.5, 8.83203125, 14.6640625,
  8.83203125, 8.83203125, 12.33203125, 26.6640625, 15.33203125, 21,
];
const DATE_WIDTHS = [
  4.83203125, 4.83203125, 4.83203125, 4.83203125, 4.83203125, 4.83203125,
  4.83203125, 4.83203125, 4.83203125, 3.83203125, 4.83203125, 4.83203125,
  4.83203125, 4.83203125, 4.83203125, 4.83203125, 4.83203125, 3.5, 4.83203125,
  4.83203125, 4.83203125, 3.5, 3.5, 3.5, 3.5, 4.83203125, 3.5, 4.83203125, 3.5,
  3.5, 3.5,
];
const LEGEND = [
  ["الرمز / Symbol", "الوصف", "Description"],
  ["1", "حضور شفت واحد", "Present — one shift"],
  ["1", "أوف أسبوعي (مظلل أصفر)", "Weekly day off (yellow fill)"],
  [
    "1",
    "تأخير أكثر من ربع ساعة (مظلل أزرق فاتح)",
    "Lateness over 15 minutes (light blue fill)",
  ],
  ["0", "غياب", "Absent"],
  ["V", "إجازة", "Vacation"],
  // The supplied workbook's English label is retained verbatim.
  ["R", "استقالة", "Vacation"],
  ["N", "مروّج جديد", ""],
];

function isSymbol(value: unknown): value is TimeSheetSymbol {
  return (
    value === "1" ||
    value === "0" ||
    value === "V" ||
    value === "R" ||
    value === "N"
  );
}

function normalizedEmployeeName(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function fillColor(cell: ExcelJS.Cell): string | undefined {
  const fillValue = cell.fill;
  if (fillValue?.type !== "pattern") return undefined;
  return fillValue.fgColor?.argb?.toUpperCase();
}

function attendanceKind(
  symbol: TimeSheetSymbol,
  cell: ExcelJS.Cell,
): TimeSheetAttendanceKind {
  if (symbol === "0") return "absent";
  if (symbol === "V") return "vacation";
  if (symbol === "R") return "resigned";
  if (symbol === "N") return "new_promoter";
  if (fillColor(cell) === "FFFFFF00") return "weekly_off";
  if (fillColor(cell) === "FFDDEBF7") return "late";
  return "present";
}

function parseAttendanceCell(
  value: ExcelJS.CellValue,
  cell: ExcelJS.Cell,
):
  | {
      symbol: TimeSheetSymbol;
      paidShiftUnits: number;
      attendanceKind: TimeSheetAttendanceKind;
    }
  | undefined {
  if (value === null || value === "") return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value > 2) return undefined;
    const symbol: TimeSheetSymbol = value === 0 ? "0" : "1";
    return {
      symbol,
      paidShiftUnits: value,
      attendanceKind: attendanceKind(symbol, cell),
    };
  }
  if (!isSymbol(value)) return undefined;
  return {
    symbol: value,
    paidShiftUnits: value === "1" ? 1 : 0,
    attendanceKind: attendanceKind(value, cell),
  };
}

export function timeSheetDates(period: OverTimeSheetInput["period"]): string[] {
  const dates: string[] = [];
  const date = new Date(`${period.startDate}T00:00:00Z`);
  while (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) <= period.endDate
  ) {
    dates.push(date.toISOString().slice(0, 10));
    if (dates.length > 31)
      throw new RangeError("Time sheet period exceeds 31 days");
    date.setUTCDate(date.getUTCDate() + 1);
  }
  if (!dates.length) throw new RangeError("Invalid time sheet period");
  return dates;
}

function headerDate(value: ExcelJS.CellValue): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return value.toISOString().slice(0, 10);
  if (typeof value !== "string") return undefined;
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day)
    ? date.toISOString().slice(0, 10)
    : undefined;
}

/** Reads the legacy workbook's date columns without relying on hidden metadata. */
export async function detectTimeSheetPeriod(buffer: Buffer): Promise<{
  month: string;
  startDate: string;
  endDate: string;
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets.find(
    (candidate) =>
      candidate.name !== "Employees_DB" &&
      candidate.name !== "_payroll_metadata" &&
      candidate.getCell(1, 13).value !== null,
  );
  if (!sheet) throw new RangeError("Time sheet date columns are missing");
  const dates: string[] = [];
  for (let column = 13; column <= sheet.columnCount; column++) {
    const value = sheet.getCell(1, column).value;
    if (value === "Paid Days") break;
    const date = headerDate(value);
    if (!date) throw new RangeError("Invalid time sheet date header");
    dates.push(date);
  }
  if (!dates.length || dates.length > 31)
    throw new RangeError("Invalid time sheet date range");
  const expected = new Date(`${dates[0]}T00:00:00Z`);
  for (const date of dates) {
    if (expected.toISOString().slice(0, 10) !== date)
      throw new RangeError("Time sheet date columns must be consecutive");
    expected.setUTCDate(expected.getUTCDate() + 1);
  }
  const endDate = dates[dates.length - 1];
  return { month: endDate.slice(0, 7), startDate: dates[0], endDate };
}

function sheetName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function fill(argb: string): ExcelJS.FillPattern {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function styleRow(row: ExcelJS.Row, columns: number, header = false) {
  for (let col = 1; col <= columns; col++) {
    const cell = row.getCell(col);
    cell.font = { name: "Calibri", size: 11, color: { argb: "FF000000" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    const edge: ExcelJS.Border = { style: "thin", color: { argb: "FF000000" } };
    cell.border = { top: edge, bottom: edge, left: edge, right: edge };
    cell.fill = fill(header ? "FFD8D8D8" : "FFFFFFFF");
  }
}

function identityValues(employee: TimeSheetEmployee) {
  return [
    employee.identity,
    employee.name,
    employee.mobile ?? "",
    employee.nationality ?? "",
    employee.region ?? "",
    employee.city ?? "",
    employee.chain ?? "",
    employee.store ?? "",
    employee.monthlySalary,
    employee.bankAccount ?? "",
    employee.bankName ?? "",
    employee.sponsorship ?? "",
  ];
}

export async function createOvertimeTimeSheet(
  input: OverTimeSheetInput,
): Promise<Buffer> {
  const dates = timeSheetDates(input.period);
  const workbook = new ExcelJS.Workbook();
  const directory = workbook.addWorksheet("Employees_DB");
  directory.columns = DB_WIDTHS.map((width) => ({ width }));
  const directoryHeaders = [...IDENTITY_HEADERS];
  directoryHeaders[0] = "-+";
  directoryHeaders[10] = "Bank name";
  styleRow(directory.addRow(directoryHeaders), 12, true);
  directory.getRow(1).eachCell((cell) => {
    cell.fill = fill("FFF2F2F2");
  });
  const sheet = workbook.addWorksheet(sheetName(input.period.month));
  sheet.columns = [
    ...PERIOD_WIDTHS,
    ...dates.map((_, i) => DATE_WIDTHS[i]),
    9.33203125,
    12.33203125,
    15.5,
    10,
    8.83203125,
    12.33203125,
    12.33203125,
  ].map((width) => ({ width }));
  sheet.views = [
    { state: "frozen", xSplit: 2, ySplit: 1, topLeftCell: "C2", zoomScale: 90 },
  ];
  const header = sheet.addRow([
    ...IDENTITY_HEADERS,
    ...dates.map((date) => new Date(`${date}T00:00:00Z`)),
    ...SUMMARY_HEADERS,
  ]);
  styleRow(header, 19 + dates.length, true);
  header.height = 92.25;
  for (let column = 1; column <= 12; column++) {
    const cell = header.getCell(column);
    cell.border = {
      ...cell.border,
      top: { style: "medium", color: { argb: "FF000000" } },
    };
  }
  dates.forEach((_, index) => {
    header.getCell(13 + index).numFmt = "dd/mm/yyyy ddd";
    header.getCell(13 + index).alignment = {
      horizontal: "center",
      vertical: "middle",
      textRotation: -90,
    };
  });
  const metadata = workbook.addWorksheet("_payroll_metadata", {
    state: "veryHidden",
  });
  metadata.addRows([
    ["version", VERSION],
    ["projectId", input.projectId],
    ["periodId", input.period.id],
    ["startDate", input.period.startDate],
    ["endDate", input.period.endDate],
    ["identity", "userId", "workDate", "overtimeMinutes", "amount"],
  ]);
  const identities = new Set<string>();
  for (const employee of input.employees) {
    if (!employee.identity || identities.has(employee.identity))
      throw new Error("Employee identities must be nonempty and unique");
    identities.add(employee.identity);
    const identity = identityValues(employee);
    const directoryRow = directory.addRow(identity);
    styleRow(directoryRow, 12);
    directoryRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "none" };
    });
    const row = sheet.addRow(identity);
    styleRow(row, 19 + dates.length);
    row.getCell(1).fill = fill("FF9DC3E6");
    for (let column = 2; column <= 11; column++)
      row.getCell(column).fill = fill("FFB2A1C7");
    row.getCell(2).alignment = { horizontal: "right", vertical: "middle" };
    row.getCell(12).fill = { type: "pattern", pattern: "none" };
    const attendance = new Map(
      employee.attendance.map((day) => [day.workDate, day]),
    );
    const overrides = new Map(
      employee.overrides?.map((day) => [day.workDate, day]),
    );
    let paidDays = 0;
    let lateness = 0;
    dates.forEach((date, index) => {
      if (date > input.throughDate) return;
      const day = attendance.get(date);
      const override = overrides.get(date);
      const symbol = isSymbol(override?.symbol)
        ? override.symbol
        : day?.vacation
          ? "V"
          : day?.present || day?.weeklyOff
            ? "1"
            : "0";
      const paidShiftUnits = isSymbol(override?.symbol)
        ? Number(override.paidShiftUnits ?? (symbol === "1" ? 1 : 0))
        : symbol === "1"
          ? 1
          : 0;
      const attendanceKind =
        override?.attendanceKind ??
        (symbol === "0"
          ? "absent"
          : symbol === "V"
            ? "vacation"
            : symbol === "R"
              ? "resigned"
              : symbol === "N"
                ? "new_promoter"
                : day?.weeklyOff
                  ? "weekly_off"
                  : (day?.lateMinutes ?? 0) > 15
                    ? "late"
                    : "present");
      const cell = row.getCell(index + 13);
      cell.value =
        paidShiftUnits !== (symbol === "1" ? 1 : 0) ? paidShiftUnits : symbol;
      paidDays += paidShiftUnits;
      if (attendanceKind === "weekly_off") cell.fill = fill("FFFFFF00");
      else if (attendanceKind === "late") {
        cell.fill = fill("FFDDEBF7");
        lateness++;
      } else if (attendanceKind === "absent") cell.fill = fill("FFFF0000");
      else if (attendanceKind === "vacation") cell.fill = fill("FF4472C4");
      else if (attendanceKind === "resigned") cell.fill = fill("FF92D050");
      else if (attendanceKind === "new_promoter") cell.fill = fill("FF999999");
      cell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"1,0,V,R,N"'],
        showErrorMessage: true,
      };
    });
    const dailyRate = employee.monthlySalary / dates.length;
    const calculatedSalary = roundMoney(paidDays * dailyRate);
    const deduction =
      employee.deduction ?? roundMoney(lateness * dailyRate * 0.25);
    const overtime = employee.overtime.filter(
      (item) =>
        item.workDate >= input.period.startDate &&
        item.workDate <= input.period.endDate &&
        item.workDate <= input.throughDate,
    );
    const bonus = roundMoney(
      (employee.manualBonus ?? 0) +
        overtime.reduce((sum, item) => sum + item.amount, 0),
    );
    [
      paidDays,
      roundMoney(dailyRate),
      calculatedSalary,
      deduction,
      bonus,
      employee.netPay ?? roundMoney(calculatedSalary - deduction + bonus),
      lateness,
    ].forEach((value, index) => {
      row.getCell(13 + dates.length + index).value = value;
    });
    for (let index = 0; index <= 6; index++) {
      const cell = row.getCell(13 + dates.length + index);
      cell.numFmt = "0";
      cell.fill = fill([3, 4, 6].includes(index) ? "FFD6E3BC" : "FFCCC0D9");
    }
    metadata.addRow([employee.identity, employee.userId]);
    overtime.forEach((item) =>
      metadata.addRow([
        employee.identity,
        employee.userId,
        item.workDate,
        item.overtimeMinutes,
        item.amount,
      ]),
    );
  }
  const legendRow = input.employees.length + 3;
  sheet.mergeCells(legendRow, 1, legendRow, 3);
  sheet.getCell(legendRow, 1).value = "فهرس الرموز / Legend";
  styleRow(sheet.getRow(legendRow), 3, true);
  sheet.getRow(legendRow).font = { name: "Calibri", size: 12, bold: true };
  LEGEND.forEach((values, index) => {
    const row = sheet.getRow(legendRow + index + 1);
    row.values = values;
    row.height = 15.75;
    styleRow(row, 3, index === 0);
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(3).alignment = { horizontal: "left" };
    if (index === 2) row.getCell(1).fill = fill("FFFFFF00");
    if (index === 3) row.getCell(1).fill = fill("FFDDEBF7");
    if (index === 4) row.getCell(1).fill = fill("FFFF0000");
    if (index === 5) row.getCell(1).fill = fill("FF4472C4");
    if (index === 6) row.getCell(1).fill = fill("FF92D050");
    if (index === 7) row.getCell(1).fill = fill("FF999999");
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function parseOvertimeTimeSheet(
  input: OverTimeSheetInput & { buffer: Buffer },
): Promise<ParsedTimeSheet> {
  const rejectedRows: ParsedTimeSheet["rejectedRows"] = [];
  const rows: ParsedTimeSheet["rows"] = [];
  const employees: ParsedTimeSheet["employees"] = [];
  const reject = (rowNumber: number, reason: string) =>
    rejectedRows.push({ rowNumber, reason });
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(input.buffer);
  } catch {
    return {
      rows: [],
      employees: [],
      rejectedRows: [
        { rowNumber: 0, reason: "The XLSX workbook could not be read" },
      ],
    };
  }
  const metadata = workbook.getWorksheet("_payroll_metadata");
  const expectedMetadata = [
    VERSION,
    input.projectId,
    input.period.id,
    input.period.startDate,
    input.period.endDate,
  ];
  if (metadata)
    expectedMetadata.forEach((value, index) => {
      if (metadata.getCell(index + 1, 2).value !== value)
        reject(
          0,
          `Invalid workbook metadata: ${["version", "project", "period", "start date", "end date"][index]}`,
        );
    });
  const dates = timeSheetDates(input.period);
  const sheet = workbook.getWorksheet(sheetName(input.period.month));
  if (!sheet || !workbook.getWorksheet("Employees_DB")) {
    reject(0, "Required worksheets are missing");
    return { rows: [], employees: [], rejectedRows };
  }
  const directory = workbook.getWorksheet("Employees_DB")!;
  const directoryHeaders = [...IDENTITY_HEADERS];
  directoryHeaders[0] = "-+";
  directoryHeaders[10] = "Bank name";
  directoryHeaders.forEach((expected, index) => {
    if (directory.getCell(1, index + 1).value !== expected)
      reject(1, `Invalid employee directory header in column ${index + 1}`);
  });
  if (directory.getRow(1).actualCellCount !== directoryHeaders.length)
    reject(1, "Unexpected employee directory header columns");
  const headers = [...IDENTITY_HEADERS, ...dates, ...SUMMARY_HEADERS];
  headers.forEach((expected, index) => {
    const value = sheet.getCell(1, index + 1).value;
    const normalized =
      value instanceof Date ? value.toISOString().slice(0, 10) : value;
    if (normalized !== expected)
      reject(1, `Invalid header in column ${index + 1}`);
  });
  if (sheet.getRow(1).actualCellCount !== headers.length)
    reject(1, "Unexpected date or header columns");
  const members = new Map(
    input.employees.map((employee) => [employee.identity, employee.userId]),
  );
  const membersByName = new Map<string, string | null>();
  const membersByMobile = new Map<string, string | null>();
  for (const employee of input.employees) {
    const name = normalizedEmployeeName(employee.name ?? "");
    if (!name) continue;
    membersByName.set(name, membersByName.has(name) ? null : employee.userId);
    const mobile = String(employee.mobile ?? "").replace(/\D/g, "");
    if (mobile)
      membersByMobile.set(
        mobile,
        membersByMobile.has(mobile) ? null : employee.userId,
      );
  }
  if (members.size !== input.employees.length)
    reject(0, "Project employee identities are not unique");
  const mappedIdentities = new Set<string>();
  if (metadata) {
    for (let rowNumber = 7; rowNumber <= metadata.rowCount; rowNumber++) {
      const row = metadata.getRow(rowNumber);
      if (row.getCell(3).value !== null) continue;
      const identity = row.getCell(1).value;
      if (
        typeof identity !== "string" ||
        members.get(identity) !== row.getCell(2).value ||
        mappedIdentities.has(identity)
      ) {
        reject(0, "Invalid employee identity mapping in workbook metadata");
      } else mappedIdentities.add(identity);
    }
  }
  if (metadata && mappedIdentities.size !== members.size)
    reject(0, "Missing employee identity mapping in workbook metadata");
  const seen = new Set<string>();
  let legendRowNumber: number | undefined;
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.getCell(1).value === "فهرس الرموز / Legend") {
      legendRowNumber = rowNumber;
      break;
    }
    if (row.actualCellCount === 0) continue;
    const identityValue = row.getCell(1).value;
    const identity =
      typeof identityValue === "string" || typeof identityValue === "number"
        ? String(identityValue)
        : "";
    const name = String(row.getCell(2).value ?? "").trim();
    const mobile = String(row.getCell(3).value ?? "").replace(/\D/g, "");
    // Legacy August rosters contain Iqamas that may not yet exist on the
    // Gatemea user record. Resolve the existing promoter by their displayed
    // name first, then use Iqama only when name data is unavailable.
    const userId =
      membersByMobile.get(mobile) ??
      membersByName.get(normalizedEmployeeName(name)) ??
      members.get(identity);
    if (!userId)
      reject(rowNumber, "Employee identity is not assigned to this project");
    if (seen.has(identity)) reject(rowNumber, "Duplicate employee identity");
    seen.add(identity);
    if (userId) {
      const text = (column: number) =>
        String(row.getCell(column).value ?? "").trim();
      const monthlySalary = Number(row.getCell(9).value ?? 0);
      if (!Number.isFinite(monthlySalary) || monthlySalary < 0)
        reject(rowNumber, "Invalid Basic Salary");
      else
        employees.push({
          userId,
          name,
          mobile: text(3),
          nationality: text(4),
          monthlySalary,
          bankAccount: text(10),
          bankName: text(11),
          sponsorship: text(12),
        });
    }
    dates.forEach((workDate, index) => {
      const cell = row.getCell(13 + index);
      const parsed = parseAttendanceCell(cell.value, cell);
      if (cell.value === null || cell.value === "") return;
      if (!parsed)
        reject(rowNumber, `Invalid attendance symbol for ${workDate}`);
      else if (workDate > input.throughDate)
        reject(rowNumber, `Future attendance is not allowed for ${workDate}`);
      else if (userId) rows.push({ userId, workDate, ...parsed });
    });
  }
  if (legendRowNumber === undefined)
    reject(0, "The workbook legend is missing");
  else {
    const expectedLegend = [
      ["فهرس الرموز / Legend", "فهرس الرموز / Legend", "فهرس الرموز / Legend"],
      ...LEGEND,
    ];
    expectedLegend.forEach((expected, index) => {
      const rowNumber = legendRowNumber + index;
      const row = sheet.getRow(rowNumber);
      const matches =
        row.actualCellCount === expected.length &&
        expected.every((value, column) => {
          const actual = row.getCell(column + 1).value;
          return (
            (actual === 1 || actual === 0 ? String(actual) : actual) === value
          );
        });
      if (!matches) reject(rowNumber, "Invalid workbook legend row");
    });
    for (
      let rowNumber = legendRowNumber + expectedLegend.length;
      rowNumber <= sheet.rowCount;
      rowNumber++
    ) {
      if (sheet.getRow(rowNumber).actualCellCount > 0)
        reject(rowNumber, "Unexpected populated row after the workbook legend");
    }
  }
  for (const identity of members.keys())
    if (!seen.has(identity))
      reject(0, `Missing employee identity: ${identity}`);
  return {
    rows: rejectedRows.length ? [] : rows,
    employees: rejectedRows.length ? [] : employees,
    rejectedRows,
  };
}
