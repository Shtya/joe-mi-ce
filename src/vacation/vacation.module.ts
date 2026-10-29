import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { VacationService } from "./vacation.service";
import { VacationController } from "./vacation.controller";
import { User } from "entities/user.entity";
import { Branch } from "entities/branch.entity";
import { Vacation } from "entities/employee/vacation.entity";
import { VacationDate } from "entities/employee/vacation-date.entity";
import { Journey } from "entities/all_plans.entity";
import { VacationBalanceAccount } from "entities/employee/vacation-balance-account.entity";
import { VacationCompensatoryCredit } from "entities/employee/vacation-compensatory-credit.entity";
import { VacationBalanceService } from "./vacation-balance.service";
import { VacationBalanceController } from "./vacation-balance.controller";
import { VacationBalanceCron } from "./vacation-balance.cron";
import { Project } from "entities/project.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Vacation,
      User,
      Branch,
      VacationDate,
      Journey,
      Project,
      VacationBalanceAccount,
      VacationCompensatoryCredit,
    ]),
  ],
  controllers: [VacationBalanceController, VacationController],
  providers: [VacationService, VacationBalanceService, VacationBalanceCron],
})
export class VacationModule {}
