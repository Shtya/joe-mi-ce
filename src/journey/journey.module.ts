// src/journey/journey.module.ts
// ===== journey.module.ts =====
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { JwtModule } from "@nestjs/jwt";
import { JourneyService } from "./journey.service";
import { JourneyController } from "./journey.controller";
import { JourneyCron } from "./journey.cron";
import { CheckIn, Journey, JourneyPlan } from "entities/all_plans.entity";
import { User } from "entities/user.entity";
import { Branch } from "entities/branch.entity";
import { Shift } from "entities/employee/shift.entity";
import { Region } from "entities/locations/region.entity";
import { City } from "entities/locations/city.entity";
import { NotificationModule } from "src/notification/notification.module";
import { UsersService } from "src/users/users.service";
import { Project } from "entities/project.entity";
import { Vacation } from "entities/employee/vacation.entity";
import { VacationDate } from "entities/employee/vacation-date.entity";
import { Sale } from "entities/products/sale.entity";
import { PromoterLocation } from "entities/promoter-location.entity";
import { LocationLog } from "entities/location-log.entity";
import { LocationGateway } from "./location.gateway";
import { AuthModule } from "src/auth/auth.module";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      Journey,
      JourneyPlan,
      CheckIn,
      User,
      Branch,
      Shift,
      Region,
      City,
      User,
      Project,
      Vacation,
      VacationDate,
      Sale,
      PromoterLocation,
      LocationLog,
    ]),
    ScheduleModule.forRoot(),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
    NotificationModule,
  ],
  controllers: [JourneyController],
  providers: [JourneyService, JourneyCron, UsersService, LocationGateway],
  exports: [JourneyService],
})
export class JourneyModule {}
