// project.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from 'entities/project.entity';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { Branch } from 'entities/branch.entity';
import { User } from 'entities/user.entity';
import { Shift } from 'entities/employee/shift.entity';
import { UsersService } from 'src/users/users.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project, Branch, User , Shift])],
  controllers: [ProjectController],
  providers: [ProjectService,UsersService],
  exports: [ProjectService],
})
export class ProjectModule {}