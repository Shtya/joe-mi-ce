import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from 'entities/products/category.entity';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { User } from 'entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { Branch } from 'entities/branch.entity';
import { Project } from 'entities/project.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Category , User,Branch,Project,])],
  controllers: [CategoryController],
  providers: [CategoryService,UsersService],
  exports: [CategoryService],
})
export class CategoryModule {}