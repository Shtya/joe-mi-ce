import { BadRequestException } from "@nestjs/common";

export function trackingDateRange(fromDate?: string, toDate?: string) {
  function parseDate(value: string | undefined, endOfDay: boolean) {
    if (value === undefined) return undefined;
    const calendarDate = new Date(`${value}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(calendarDate.getTime()) ||
      calendarDate.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException("Invalid tracking date; use YYYY-MM-DD");
    }
    return new Date(
      `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+03:00`,
    );
  }

  const start = parseDate(fromDate, false);
  const end = parseDate(toDate, true);
  if (start && end && start > end) {
    throw new BadRequestException("Invalid tracking date range");
  }
  return { start, end };
}

export function saudiHistoryTimestamp(value: Date | string): string;
export function saudiHistoryTimestamp(value: null): null;
export function saudiHistoryTimestamp(
  value: Date | string | null,
): string | null;
export function saudiHistoryTimestamp(value: Date | string | null) {
  if (value == null) return null;
  return new Date(new Date(value).getTime() + 3 * 60 * 60 * 1000)
    .toISOString()
    .replace("Z", "+03:00");
}
