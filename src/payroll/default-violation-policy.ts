import { DefaultViolationRule } from "./payroll.types";
const warning = { kind: "warning", value: 0 } as const;
const percent = (value: number) => ({
  kind: "daily_wage_percentage" as const,
  value,
});
const days = (value: number, includesLateTimeWage = false) => ({
  kind: "daily_wage_days" as const,
  value,
  includesLateTimeWage,
});
const earlyPercent = (value: number) => ({
  kind: "daily_wage_percentage" as const,
  value,
  includesEarlyLeaveTimeWage: true,
});
const earlyDays = (value: number) => ({
  kind: "daily_wage_days" as const,
  value,
  includesEarlyLeaveTimeWage: true,
});
export const DEFAULT_VIOLATION_RULES: readonly DefaultViolationRule[] = [
  {
    ruleKey: "LATE_UP_TO_15_BLOCKS_OTHERS",
    eventType: "late_arrival",
    minimumMinutes: 1,
    maximumMinutes: 15,
    blocksOtherWorkers: true,
    actions: [warning, percent(5), percent(10), percent(20)],
  },
  {
    ruleKey: "LATE_UP_TO_15_NO_BLOCK",
    eventType: "late_arrival",
    minimumMinutes: 1,
    maximumMinutes: 15,
    blocksOtherWorkers: false,
    actions: [warning, percent(15), percent(25), percent(50)],
  },
  {
    ruleKey: "LATE_16_TO_30_BLOCKS_OTHERS",
    eventType: "late_arrival",
    minimumMinutes: 16,
    maximumMinutes: 30,
    blocksOtherWorkers: true,
    actions: [percent(10), percent(15), percent(25), percent(50)],
  },
  {
    ruleKey: "LATE_16_TO_30_NO_BLOCK",
    eventType: "late_arrival",
    minimumMinutes: 16,
    maximumMinutes: 30,
    blocksOtherWorkers: false,
    actions: [percent(25), percent(50), percent(75), days(1)],
  },
  {
    ruleKey: "LATE_31_TO_60_BLOCKS_OTHERS",
    eventType: "late_arrival",
    minimumMinutes: 31,
    maximumMinutes: 60,
    blocksOtherWorkers: true,
    actions: [percent(25), percent(50), percent(75), days(1)],
  },
  {
    ruleKey: "LATE_31_TO_60_NO_BLOCK",
    eventType: "late_arrival",
    minimumMinutes: 31,
    maximumMinutes: 60,
    blocksOtherWorkers: false,
    actions: [percent(30), percent(50), days(1), days(2, true)],
  },
  {
    ruleKey: "LATE_OVER_60",
    eventType: "late_arrival",
    minimumMinutes: 61,
    maximumMinutes: null,
    blocksOtherWorkers: null,
    actions: [warning, days(1), days(2), days(3, true)],
  },
  {
    ruleKey: "EARLY_LEAVE_UNDER_15",
    eventType: "early_leave",
    minimumMinutes: 1,
    maximumMinutes: 14,
    blocksOtherWorkers: null,
    actions: [warning, earlyPercent(10), earlyPercent(25), earlyDays(1)],
  },
  {
    ruleKey: "EARLY_LEAVE_15_OR_MORE",
    eventType: "early_leave",
    minimumMinutes: 15,
    maximumMinutes: null,
    blocksOtherWorkers: null,
    actions: [
      earlyPercent(10),
      earlyPercent(25),
      earlyPercent(50),
      earlyDays(1),
    ],
  },
  {
    ruleKey: "UNAUTHORIZED_PRESENCE",
    eventType: "unauthorized_presence",
    minimumMinutes: 1,
    maximumMinutes: null,
    blocksOtherWorkers: null,
    actions: [warning, percent(10), percent(25), days(1)],
  },
];
