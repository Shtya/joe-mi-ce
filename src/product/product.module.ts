import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'; 
import { Brand } from 'entities/products/brand.entity';
import { Category } from 'entities/products/category.entity';
import { Product } from 'entities/products/product.entity'; 
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
 import { User } from 'entities/user.entity';
import { Stock } from 'entities/products/stock.entity';
import { Project } from 'entities/project.entity';
import { Branch } from 'entities/branch.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product , Brand , Branch , Category , Stock , Project , User]),
    // BrandModule,
    // CategoryModule,
    // StockModule,
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}