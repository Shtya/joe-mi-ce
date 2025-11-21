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
    ]),
    ScheduleModule.forRoot(),
		NotificationModule,
  ],
  controllers: [JourneyController],
  providers: [JourneyService, JourneyCron],
  exports: [JourneyService],
})
export class JourneyModule {}
