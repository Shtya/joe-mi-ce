import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
 import { VacationService } from './vacation.service';
import { VacationController } from './vacation.controller';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Vacation } from 'entities/employee/vacation.entity';
import { VacationDate } from 'entities/employee/vacation-date.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Vacation, User, Branch,VacationDate])],
  controllers: [VacationController],
  providers: [VacationService],
})
export class VacationModule {}
