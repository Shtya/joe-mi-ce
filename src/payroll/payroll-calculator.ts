import { DEFAULT_VIOLATION_RULES } from "./default-violation-policy";
import { DefaultViolationRule, ViolationAction } from "./payroll.types";

export interface PayrollViolationCalculationInput {
  eventType: "late_arrival" | "early_leave" | "unauthorized_presence";
  monthlySalary: number;
  minutes: number;
  blocksOtherWorkers: boolean | null;
  annualOccurrence: number;
  hasAcceptedPermission?: boolean;
  rules?: readonly DefaultViolationRule[];
}

export interface CalculatedPayrollViolation {
  ruleKey: string;
  penaltyOccurrence: number;
  action: ViolationAction;
  deductionAmount: number;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculatePayrollViolation(
  input: PayrollViolationCalculationInput,
): CalculatedPayrollViolation | null {
  if (
    input.hasAcceptedPermission ||
    input.minutes <= 0 ||
    input.monthlySalary < 0
  ) {
    return null;
  }

  const rule = (input.rules ?? DEFAULT_VIOLATION_RULES).find(
    (candidate) =>
      candidate.eventType === input.eventType &&
      input.minutes >= candidate.minimumMinutes &&
      (candidate.maximumMinutes === null ||
        input.minutes <= candidate.maximumMinutes) &&
      (candidate.blocksOtherWorkers === null ||
        candidate.blocksOtherWorkers === input.blocksOtherWorkers),
  );
  if (!rule) return null;

  const penaltyOccurrence = Math.min(Math.max(input.annualOccurrence, 1), 4);
  const action = rule.actions[penaltyOccurrence - 1];
  const dailyWage = input.monthlySalary / 30;
  let deduction =
    action.kind === "daily_wage_percentage"
      ? (dailyWage * action.value) / 100
      : action.kind === "daily_wage_days"
        ? dailyWage * action.value
        : 0;

  if (action.includesLateTimeWage || action.includesEarlyLeaveTimeWage) {
    deduction += (dailyWage / (8 * 60)) * input.minutes;
  }

  return {
    ruleKey: rule.ruleKey,
    penaltyOccurrence,
    action,
    deductionAmount: roundMoney(deduction),
  };
}

export interface ShiftVarianceInput {
  journeyDate: string;
  shiftStartTime: string;
  shiftEndTime: string;
  checkInTime?: Date | null;
  checkOutTime?: Date | null;
  timezoneOffsetMinutes?: number;
}

function localTimestamp(date: string, time: string): number {
  return Date.parse(`${date}T${time.replace(/^(\d{2}:\d{2})$/, "$1:00")}Z`);
}

export function calculateShiftVariance(input: ShiftVarianceInput): {
  lateMinutes: number;
  earlyLeaveMinutes: number;
} {
  const offsetMs = (input.timezoneOffsetMinutes ?? 180) * 60_000;
  const start = localTimestamp(input.journeyDate, input.shiftStartTime);
  let end = localTimestamp(input.journeyDate, input.shiftEndTime);
  if (end <= start) end += 24 * 60 * 60_000;

  const checkIn = input.checkInTime
    ? input.checkInTime.getTime() + offsetMs
    : start;
  let checkOut = input.checkOutTime
    ? input.checkOutTime.getTime() + offsetMs
    : end;
  if (input.checkOutTime && checkOut < start) checkOut += 24 * 60 * 60_000;

  return {
    lateMinutes: Math.max(0, Math.floor((checkIn - start) / 60_000)),
    earlyLeaveMinutes: Math.max(0, Math.floor((end - checkOut) / 60_000)),
  };
}

export function calculateMinutesAfterShift(input: {
  journeyDate: string;
  shiftStartTime: string;
  shiftEndTime: string;
  checkOutTime: Date;
  timezoneOffsetMinutes?: number;
}): number {
  const offsetMs = (input.timezoneOffsetMinutes ?? 180) * 60_000;
  const start = localTimestamp(input.journeyDate, input.shiftStartTime);
  let end = localTimestamp(input.journeyDate, input.shiftEndTime);
  if (end <= start) end += 24 * 60 * 60_000;
  let checkOut = input.checkOutTime.getTime() + offsetMs;
  if (checkOut < start) checkOut += 24 * 60 * 60_000;
  return Math.max(0, Math.floor((checkOut - end) / 60_000));
}
