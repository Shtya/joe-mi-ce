import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportsCron } from './reports.cron';
import { MailModule } from '../mail/mail.module';
import { User } from 'entities/user.entity';
import { Project } from 'entities/project.entity';
import { Journey, CheckIn } from 'entities/all_plans.entity';
import { Sale } from 'entities/products/sale.entity';
import { Product } from 'entities/products/product.entity';
import { Vacation } from 'entities/employee/vacation.entity';
import { VacationDate } from 'entities/employee/vacation-date.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Project, Journey, CheckIn, Sale, Product, Vacation, VacationDate]),
    MailModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsCron],
  exports: [ReportsService],
})
export class ReportsModule {}
