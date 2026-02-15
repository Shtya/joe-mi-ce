// src/journey/journey.module.ts
// ===== journey.module.ts =====
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { JourneyService } from './journey.service';
import { JourneyController } from './journey.controller';
import { JourneyCron } from './journey.cron';
import { CheckIn, Journey, JourneyPlan } from 'entities/all_plans.entity';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Shift } from 'entities/employee/shift.entity';
import { Region } from 'entities/locations/region.entity';
import { City } from 'entities/locations/city.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { UsersService } from 'src/users/users.service';
import { Project } from 'entities/project.entity';
import { Vacation } from 'entities/employee/vacation.entity';
import { VacationDate } from 'entities/employee/vacation-date.entity';

@Module({
  imports: [
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
      VacationDate
    ]),
    ScheduleModule.forRoot(),
		NotificationModule,
  ],
  controllers: [JourneyController],
  providers: [JourneyService, JourneyCron,UsersService],
  exports: [JourneyService,],
})
export class JourneyModule {}
