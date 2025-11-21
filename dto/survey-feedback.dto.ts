import { IsUUID, IsArray, ValidateNested, IsString } from 'class-validator';
import { Type } from 'class-transformer';

class FeedbackAnswerDto {
  @IsUUID()
  questionId: string;

  @IsString()
  answer: string;  
}

export class CreateSurveyFeedbackDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  branchId: string;

  @IsUUID()
  surveyId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeedbackAnswerDto)
  answers: FeedbackAnswerDto[];
}
