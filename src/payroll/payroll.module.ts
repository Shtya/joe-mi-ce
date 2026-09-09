import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CheckIn, Journey } from "entities/all_plans.entity";
import { VacationDate } from "entities/employee/vacation-date.entity";
import { Vacation } from "entities/employee/vacation.entity";
import { EmployeeSalary } from "entities/payroll/employee-salary.entity";
import { PayrollLineViolation } from "entities/payroll/payroll-line-violation.entity";
import { PayrollLine } from "entities/payroll/payroll-line.entity";
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
      PayrollViolationRule,
      PayrollViolation,
      PayrollPeriod,
      PayrollLine,
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
