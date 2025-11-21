import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'; 
import { Brand } from 'entities/products/brand.entity';
import { BrandController } from './brand.controller';
import { BrandService } from './brand.service';
import { User } from 'entities/user.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Brand , User])],
  controllers: [BrandController],
  providers: [BrandService],
  exports: [BrandService],
})
export class BrandModule {}