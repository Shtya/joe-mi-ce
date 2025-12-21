import { Controller, Get, Post, Body, Param, Delete, Query, Patch, UseGuards, Req } from '@nestjs/common';
import { SurveyService } from './survey.service';
import { CreateSurveyDto, UpdateSurveyDto } from 'dto/survey.dto';
import { CreateSurveyFeedbackDto } from 'dto/survey-feedback.dto';
import { CRUD } from 'common/crud.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';

@UseGuards(AuthGuard)
@Controller('surveys')
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  @Post()
  @Permissions(EPermission.SURVEY_CREATE)
  create(@Body() dto: CreateSurveyDto, @Req() req: any) {
    return this.surveyService.create(dto, req.user);
  }

  // 🔹 Create survey feedback
  @Post('feedback')
  @Permissions(EPermission.SURVEY_FEEDBACK_CREATE)
  async createFeedback(@Body() dto: CreateSurveyFeedbackDto) {
    return this.surveyService.createFeedback(dto);
  }

  // 🔹 Get feedback by promoter
  @Get('feedback/by-promoter/:promoterId')
  @Permissions(EPermission.SURVEY_FEEDBACK_READ)
  async getByPromoter(@Param('promoterId') promoterId: string) {
    return this.surveyService.getFeedbackByPromoter(promoterId);
  }

  // 🔹 Get feedback by survey
  @Get('feedback/by-survey/:surveyId')
  @Permissions(EPermission.SURVEY_FEEDBACK_READ)
  async getBySurvey(@Param('surveyId') surveyId: string , @Query() query :any) {
    return CRUD.findAllRelation(this.surveyService.feedbackRepo, 'feedback', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['user', 'answers' , "survey"], [], { survey: { id: surveyId }, ...query.filters });
  }
	// async getFeedbackBySurvey(surveyId: string) {
	// 	return await this.feedbackRepo.find({
	// 		where: { survey: { id: surveyId } },
	// 		relations: ['user', 'answers', 'answers.question'],
	// 	});
	// }


  // 🔹 Get all surveys
  @Get()
  @Permissions(EPermission.SURVEY_READ)
  findAll(@Query() query: any, @Req() req: any) {
    return CRUD.findAll2(this.surveyService.surveyRepo, 'survey', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['questions','questions.answers','feedbacks.user',
      'feedbacks.branch'], [], { projectId: req.user.project?.id ||req.user.project_id, ...query.filters });
  }

  // 🔹 Get survey by ID
  @Get(':id')
  @Permissions(EPermission.SURVEY_READ)
  findOne(@Param('id') id: string) {
    return CRUD.findOne(this.surveyService.surveyRepo, 'survey', id, ['questions','questions.answers','feedbacks.user',
      'feedbacks.branch']);
  }

  // 🔹 Update survey
  @Patch(':id')
  @Permissions(EPermission.SURVEY_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateSurveyDto) {
    return this.surveyService.update(id, dto);
  }

  // 🔹 Delete survey
  @Delete(':id')
  @Permissions(EPermission.SURVEY_DELETE)
  remove(@Param('id') id: string) {
    return CRUD.softDelete(this.surveyService.surveyRepo, 'survey', id);
  }
}
