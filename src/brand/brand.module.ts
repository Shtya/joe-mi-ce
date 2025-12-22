import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from 'entities/products/brand.entity';
import { BrandController } from './brand.controller';
import { BrandService } from './brand.service';
import { User } from 'entities/user.entity';
import { Category } from 'entities/products/category.entity';
import { UsersService } from 'src/users/users.service';
import { BranchService } from 'src/branch/branch.service';
import { Branch } from 'entities/branch.entity';
import { Project } from 'entities/project.entity';
import { City } from 'entities/locations/city.entity';
import { Chain } from 'entities/locations/chain.entity';
import { SalesTarget } from 'entities/sales-target.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Brand , User,Category,Branch,Project,City,Chain,SalesTarget])],
  controllers: [BrandController],
  providers: [BrandService,UsersService,BranchService],
  exports: [BrandService,],
})
export class BrandModule {}