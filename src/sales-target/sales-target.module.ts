// sales-target.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SalesTargetService } from './sales-target.service';
import { SalesTargetController } from './sales-target.controller';
import { SalesTarget } from '../../entities/sales-target.entity';
import { Branch } from '../../entities/branch.entity';
import { User } from 'entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalesTarget, Branch,User]),
    ScheduleModule.forRoot(),
  ],
  controllers: [SalesTargetController],
  providers: [SalesTargetService],
  exports: [SalesTargetService],
})
export class SalesTargetModule {}