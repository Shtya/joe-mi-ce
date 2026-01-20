import { IsString, IsEnum, IsArray, ValidateNested, IsOptional, ValidateIf, ArrayNotEmpty, IsIn, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { SurveyQuestionType } from 'entities/survey.entity';

/* ---------- Question DTOs ---------- */

export class CreateSurveyQuestionDto {
  @IsString()
  text: string;

  @IsEnum(SurveyQuestionType)
  type: SurveyQuestionType;

  @IsOptional()
  @ValidateIf(o => o.type === SurveyQuestionType.DROPDOWN)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  optional?: boolean;
}

export class UpdateSurveyQuestionDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsEnum(SurveyQuestionType)
  type?: SurveyQuestionType;

  @IsOptional()
  @ValidateIf(o => o.type === SurveyQuestionType.DROPDOWN)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  optional?: boolean;
}

/* ---------- Survey DTOs ---------- */

export class CreateSurveyDto {
  @IsString()
  name: string;

  @IsIn(['active', 'inactive'])
  status: 'active' | 'inactive';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSurveyQuestionDto)
  questions: CreateSurveyQuestionDto[];
}

export class UpdateSurveyDto extends PartialType(CreateSurveyDto) {}
