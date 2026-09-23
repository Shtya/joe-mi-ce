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
  if (validatePayrollCutoffDay(cutoffDay) === 1) {
    const { year, monthNumber } = parseMonth(month);

    return {
      startDate: `${month}-01`,
      endDate: `${month}-${String(daysInMonth(year, monthNumber)).padStart(2, "0")}`,
    };
  }
  const endBoundary = clampedDate(month, cutoffDay);
  const startBoundary = clampedDate(previousMonth(month), cutoffDay);

  return {
    startDate: startBoundary,
    endDate: previousDate(endBoundary),
  };
}

export function activePayrollPeriodMonth(
  date: string | Date,
  cutoffDay: number,
): string {
  const businessDate =
    date instanceof Date ? date.toISOString().slice(0, 10) : date;
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(businessDate)) {
    throw new RangeError("date must use YYYY-MM-DD format");
  }
  const month = businessDate.slice(0, 7);
  const period = resolvePayrollPeriod(month, cutoffDay);

  return businessDate <= period.endDate ? month : nextMonth(month);
}

/**
 * Returns the month label of the period that closes on the day *before*
 * `date` (i.e. `date` is the cutoff boundary and the period just ended),
 * or `null` when `date` is not a cutoff day for the given `cutoffDay`.
 *
 * The closing period must be finalized/synced before the new active period
 * is opened on a cutoff day.
 */
export function closingPayrollPeriodMonth(
  date: string,
  cutoffDay: number,
): string | null {
  const month = date.slice(0, 7);
  const cutoffDate = clampedDate(month, cutoffDay);
  if (date !== cutoffDate) return null;
  // Today is the cutoff boundary. The period that just closed ended
  // yesterday, and its month label is therefore yesterday's calendar month.
  return previousDate(cutoffDate).slice(0, 7);
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
    validatePayrollCutoffDay(cutoffDay),
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

function nextMonth(month: string): string {
  const { year, monthNumber } = parseMonth(month);

  return monthNumber === 12
    ? formatMonth(year + 1, 1)
    : formatMonth(year, monthNumber + 1);
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

export function validatePayrollCutoffDay(cutoffDay: number): number {
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
