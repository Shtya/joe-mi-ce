import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CheckIn, Journey } from "entities/all_plans.entity";
import { VacationDate } from "entities/employee/vacation-date.entity";
import { Vacation } from "entities/employee/vacation.entity";
import { EmployeeSalary } from "entities/payroll/employee-salary.entity";
import { PayrollAdjustment } from "entities/payroll/payroll-adjustment.entity";
import { PayrollLineViolation } from "entities/payroll/payroll-line-violation.entity";
import { PayrollLine } from "entities/payroll/payroll-line.entity";
import { PayrollOvertime } from "entities/payroll/payroll-overtime.entity";
import { PayrollTimeSheetOverride } from "entities/payroll/payroll-timesheet-override.entity";
import { PayrollPeriod } from "entities/payroll/payroll-period.entity";
import { PayrollViolationRule } from "entities/payroll/payroll-violation-rule.entity";
import { PayrollViolation } from "entities/payroll/payroll-violation.entity";
import { Project } from "entities/project.entity";
import { User } from "entities/user.entity";
import { PayrollController } from "./payroll.controller";
import { PayrollCron } from "./payroll.cron";
import { PayrollService } from "./payroll.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      User,
      EmployeeSalary,
      PayrollAdjustment,
      PayrollViolationRule,
      PayrollViolation,
      PayrollPeriod,
      PayrollLine,
      PayrollOvertime,
      PayrollTimeSheetOverride,
      PayrollLineViolation,
      Journey,
      CheckIn,
      Vacation,
      VacationDate,
    ]),
  ],
  controllers: [PayrollController],
  providers: [PayrollService, PayrollCron],
  exports: [PayrollService],
})
export class PayrollModule {}
