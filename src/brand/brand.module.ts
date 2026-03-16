import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from 'entities/products/brand.entity';
import { BrandController } from './brand.controller';
import { BrandService } from './brand.service';
import { Category } from 'entities/products/category.entity';
import { Project } from 'entities/project.entity';
import { City } from 'entities/locations/city.entity';
import { Chain } from 'entities/locations/chain.entity';
import { SalesTarget } from 'entities/sales-target.entity';
import { BranchModule } from 'src/branch/branch.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Brand, Category, Project, City, Chain, SalesTarget]),
    BranchModule,
    UsersModule
  ],
  controllers: [BrandController],
  providers: [BrandService],
  exports: [BrandService],
})
export class BrandModule {}