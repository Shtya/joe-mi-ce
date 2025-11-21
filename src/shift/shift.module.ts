import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
 import { ShiftService } from './shift.service';
import { ShiftController } from './shift.controller';
import { Project } from 'entities/project.entity';
import { Shift } from 'entities/employee/shift.entity';
import { User } from 'entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Shift, Project , User])],
  controllers: [ShiftController],
  providers: [ShiftService],
})
export class ShiftModule {}
