import { Module } from "@nestjs/common";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JourneyModule } from "src/journey/journey.module";
import { User } from "entities/user.entity";
import { Role } from "entities/role.entity";
import { Project } from "entities/project.entity";
import { Branch } from "entities/branch.entity";
import { VacationBalanceAccount } from "entities/employee/vacation-balance-account.entity";
import { VacationBalanceReadModule } from "src/vacation/vacation-balance-read.module";

@Module({
  imports: [
    VacationBalanceReadModule,
    TypeOrmModule.forFeature([
      User,
      Role,
      Project,
      Branch,
      VacationBalanceAccount,
    ]),
    JourneyModule,
  ],

  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
