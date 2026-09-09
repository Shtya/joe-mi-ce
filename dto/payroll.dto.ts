import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

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
