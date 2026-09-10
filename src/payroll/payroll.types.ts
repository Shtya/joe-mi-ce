export enum PayrollPeriodStatus {
  PENDING = "pending",
  PAID = "paid",
}

export enum PayrollAdjustmentType {
  ADDITION = "addition",
  DEDUCTION = "deduction",
}

export enum PayrollViolationEventType {
  LATE_ARRIVAL = "late_arrival",
  EARLY_LEAVE = "early_leave",
  UNAUTHORIZED_PRESENCE = "unauthorized_presence",
}

export type PayrollPenaltyKind =
  | "warning"
  | "daily_wage_percentage"
  | "daily_wage_days";

export interface ViolationAction {
  kind: PayrollPenaltyKind;
  value: number;
  includesLateTimeWage?: boolean;
  includesEarlyLeaveTimeWage?: boolean;
}
export interface DefaultViolationRule {
  ruleKey: string;
  eventType:
    | PayrollViolationEventType
    | "late_arrival"
    | "early_leave"
    | "unauthorized_presence";
  minimumMinutes: number;
  maximumMinutes: number | null;
  blocksOtherWorkers: boolean | null;
  actions: readonly [
    ViolationAction,
    ViolationAction,
    ViolationAction,
    ViolationAction,
  ];
}
