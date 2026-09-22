export interface PayrollPeriodDates {
  startDate: string;
  endDate: string;
}

export interface OvertimeAmountInput {
  monthlySalary: number;
  scheduledShiftMinutes: number;
  overtimeMinutes: number;
}

export function resolvePayrollPeriod(
  month: string,
  cutoffDay: number,
): PayrollPeriodDates {
  const endBoundary = clampedDate(month, cutoffDay);
  const startBoundary = clampedDate(previousMonth(month), cutoffDay);

  return {
    startDate: startBoundary,
    endDate: previousDate(endBoundary),
  };
}

export function activePayrollMonth(date: Date, cutoffDay: number): string {
  const month = formatMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
  const cutoffDate = clampedDate(month, cutoffDay);

  return date.toISOString().slice(0, 10) < cutoffDate
    ? previousMonth(month)
    : month;
}

export function calculateOvertimeAmount(input: OvertimeAmountInput): number {
  return roundMoney(
    (input.monthlySalary / 30 / input.scheduledShiftMinutes) *
      Math.max(0, input.overtimeMinutes),
  );
}

function clampedDate(month: string, cutoffDay: number): string {
  const { year, monthNumber } = parseMonth(month);
  const day = Math.min(
    validateCutoffDay(cutoffDay),
    daysInMonth(year, monthNumber),
  );

  return `${month}-${String(day).padStart(2, "0")}`;
}

function previousMonth(month: string): string {
  const { year, monthNumber } = parseMonth(month);

  return monthNumber === 1
    ? formatMonth(year - 1, 12)
    : formatMonth(year, monthNumber - 1);
}

function previousDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);

  return parsed.toISOString().slice(0, 10);
}

function parseMonth(month: string): { year: number; monthNumber: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new RangeError("month must use YYYY-MM format");

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new RangeError("month must contain a valid calendar month");
  }

  return { year, monthNumber };
}

function validateCutoffDay(cutoffDay: number): number {
  if (!Number.isInteger(cutoffDay) || cutoffDay < 1 || cutoffDay > 31) {
    throw new RangeError("cutoffDay must be an integer between 1 and 31");
  }

  return cutoffDay;
}

function daysInMonth(year: number, monthNumber: number): number {
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function formatMonth(year: number, monthNumber: number): string {
  return `${String(year).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}`;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
