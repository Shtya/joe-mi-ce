// src/projects/project-stats.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Project } from 'entities/project.entity';
import { Branch } from 'entities/branch.entity';
import { User } from 'entities/user.entity';
import { Product } from 'entities/products/product.entity';
import { Competitor } from 'entities/competitor.entity';
import { Shift } from 'entities/employee/shift.entity';
import { Journey, CheckIn } from 'entities/all_plans.entity';
import { Audit } from 'entities/audit.entity';
import { Sale } from 'entities/products/sale.entity';
import { Stock } from 'entities/products/stock.entity';
import { Feedback } from 'entities/feedback.entity';
import { Survey } from 'entities/survey.entity';
import { SurveyFeedback, SurveyFeedbackAnswer } from 'entities/survey-feedback.entity';
import { ProjectStatsService } from './stats.service';
import { ProjectStatsController } from './stats.controller';

 
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      Branch,
      User,
      Product,
      Competitor,
      Shift,
      Journey,
      CheckIn,
      Audit,
      Sale,
      Stock,
      Feedback,
      Survey,
      SurveyFeedback,
      SurveyFeedbackAnswer,
    ]),
  ],
  providers: [ProjectStatsService],
  controllers: [ProjectStatsController],
  exports: [ProjectStatsService],
})
export class ProjectStatsModule {}
