import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import {
  PayrollAdjustmentType,
  PayrollPeriodStatus,
} from "src/payroll/payroll.types";

export class SetPayrollEnabledDto {
  @IsBoolean()
  enabled: boolean;
}

export class PayrollMonthQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month: string;
}

export class SalaryImportDto {
  @IsOptional() @IsString() selectedSheetName?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom?: string;
}

export class ViolationActionDto {
  @IsIn(["warning", "daily_wage_percentage", "daily_wage_days"])
  kind: "warning" | "daily_wage_percentage" | "daily_wage_days";
  @IsNumber() @Min(0) value: number;
  @IsOptional() @IsBoolean() includesLateTimeWage?: boolean;
  @IsOptional() @IsBoolean() includesEarlyLeaveTimeWage?: boolean;
}

export class PayrollViolationRuleDto {
  @IsString() ruleKey: string;
  @IsBoolean() enabled: boolean;
  @IsInt() @Min(1) sortOrder: number;
  @IsIn(["late_arrival", "early_leave", "unauthorized_presence"])
  eventType: "late_arrival" | "early_leave" | "unauthorized_presence";
  @IsInt() @Min(0) minimumMinutes: number;
  @IsOptional() @IsInt() @Min(0) maximumMinutes: number | null;
  @IsOptional() @IsBoolean() blocksOtherWorkers: boolean | null;
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ViolationActionDto)
  actions: ViolationActionDto[];
}

export class ReplacePayrollViolationRulesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PayrollViolationRuleDto)
  rules: PayrollViolationRuleDto[];
}

export class CreatePayrollPeriodDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month: string;
}

export class CreatePayrollLineDto {
  @IsUUID()
  userId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  grossSalary: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePayrollLineDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  grossSalary?: number;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class CreatePayrollAdjustmentDto {
  @IsEnum(PayrollAdjustmentType)
  type: PayrollAdjustmentType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  note?: string | null;
}

export class UpdatePayrollAdjustmentDto {
  @IsOptional()
  @IsEnum(PayrollAdjustmentType)
  type?: PayrollAdjustmentType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string | null;
}

function parseBoolean(value: unknown): unknown {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return value;
}

export class PayrollPeriodFilterDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;

  @IsOptional()
  @IsEnum(PayrollPeriodStatus)
  status?: PayrollPeriodStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  hasAdditions?: boolean;

  @IsOptional()
  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  hasDeductions?: boolean;

  @IsOptional()
  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  hasViolations?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  grossMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  grossMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  netMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  netMax?: number;
}
