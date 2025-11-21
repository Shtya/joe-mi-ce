import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Sale } from 'entities/products/sale.entity';
import { Product } from 'entities/products/product.entity';
import { Stock } from 'entities/products/stock.entity';

import { SaleService } from './sale.service';
import { SaleController } from './sale.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Sale, Product, Stock, User, Branch])],
  controllers: [SaleController],
  providers: [SaleService],
})
export class SaleModule {}
