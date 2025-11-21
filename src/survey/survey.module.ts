import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SurveyService } from './survey.service';
import { SurveyController } from './survey.controller';
import { Survey, SurveyQuestion } from 'entities/survey.entity';
import { SurveyFeedback, SurveyFeedbackAnswer } from 'entities/survey-feedback.entity';
import { User } from 'entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SurveyFeedback, SurveyFeedbackAnswer, Survey, SurveyQuestion, User])],
  controllers: [SurveyController],
  providers: [SurveyService],
})
export class SurveyModule {}
