// branch.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchService } from './branch.service';
import { BranchController } from './branch.controller';
import { Branch } from 'entities/branch.entity';
import { Chain } from 'entities/locations/chain.entity';
import { City } from 'entities/locations/city.entity';
import { Project } from 'entities/project.entity';
import { JwtService } from '@nestjs/jwt';
import { User } from 'entities/user.entity';
import { SalesTarget } from 'entities/sales-target.entity';
import { Journey, CheckIn } from 'entities/all_plans.entity';
import { UsersModule } from 'src/users/users.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([Branch, Project, City, Chain, User, SalesTarget, Journey, CheckIn]),
    UsersModule
  ],
  controllers: [BranchController],
  providers: [BranchService],
  exports: [BranchService],
})
export class BranchModule {}
