import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'entities/user.entity';
import { Role } from 'entities/role.entity';
import { Project } from 'entities/project.entity';
import { Branch } from 'entities/branch.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, Project, Branch])],

  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
