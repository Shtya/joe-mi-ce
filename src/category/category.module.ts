import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'; 
import { Category } from 'entities/products/category.entity';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { User } from 'entities/user.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Category , User])],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}