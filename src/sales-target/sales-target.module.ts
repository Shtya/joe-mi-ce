// sales-target.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SalesTargetService } from './sales-target.service';
import { SalesTargetController } from './sales-target.controller';
import { SalesTarget } from '../../entities/sales-target.entity';
import { Branch } from '../../entities/branch.entity';
import { User } from 'entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { Project } from 'entities/project.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalesTarget, Branch,User,Project]),
    ScheduleModule.forRoot(),
  ],
  controllers: [SalesTargetController],
  providers: [SalesTargetService,UsersService],
  exports: [SalesTargetService],
})
export class SalesTargetModule {}