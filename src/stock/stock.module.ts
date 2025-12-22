import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from 'entities/branch.entity';
import { Product } from 'entities/products/product.entity';
import { Stock } from 'entities/products/stock.entity';
import { BranchModule } from 'src/branch/branch.module';
import { ProductModule } from 'src/product/product.module';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { User } from 'entities/user.entity';
import { ExportModule } from 'src/export/export.module';
import { Sale } from 'entities/products/sale.entity';
import { UsersService } from 'src/users/users.service';
import { Project } from 'entities/project.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Stock, Product, Branch , User,Sale,Project] ),
    ProductModule,
    BranchModule,
		ExportModule
  ],
  controllers: [StockController],
  providers: [StockService,UsersService],
  exports: [StockService],
})
export class StockModule {}