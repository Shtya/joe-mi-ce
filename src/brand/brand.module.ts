import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'; 
import { Brand } from 'entities/products/brand.entity';
import { BrandController } from './brand.controller';
import { BrandService } from './brand.service';
import { User } from 'entities/user.entity';
import { Category } from 'entities/products/category.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Brand , User,Category])],
  controllers: [BrandController],
  providers: [BrandService],
  exports: [BrandService],
})
export class BrandModule {}