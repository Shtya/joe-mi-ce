import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
 import { VacationService } from './vacation.service';
import { VacationController } from './vacation.controller';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Vacation } from 'entities/employee/vacation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Vacation, User, Branch])],
  controllers: [VacationController],
  providers: [VacationService],
})
export class VacationModule {}
