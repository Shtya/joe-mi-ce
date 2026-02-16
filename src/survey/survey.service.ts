// handle here get all surveys/feedback get by promoter and get by survey id
// and also the user can make only one survey feedback

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSurveyDto, UpdateSurveyDto } from 'dto/survey.dto';
import { Survey, SurveyQuestion, SurveyQuestionType } from 'entities/survey.entity';
import { CreateSurveyFeedbackDto } from 'dto/survey-feedback.dto';
import { SurveyFeedback, SurveyFeedbackAnswer } from 'entities/survey-feedback.entity';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class SurveyService {
  constructor(
    @InjectRepository(Survey) public readonly surveyRepo: Repository<Survey>,
    @InjectRepository(SurveyFeedback) public feedbackRepo: Repository<SurveyFeedback>,
    @InjectRepository(SurveyFeedbackAnswer) public answerRepo: Repository<SurveyFeedbackAnswer>,
    @InjectRepository(SurveyQuestion) public questionRepo: Repository<SurveyQuestion>,
    public userService: UsersService
  ) {}

  async create(dto: CreateSurveyDto, user: any) {
    const projectId = await this.userService.resolveProjectIdFromUser(user.id)

    dto.questions?.forEach(q => {
      if (q.type === SurveyQuestionType.DROPDOWN && (!q.options || q.options.length === 0)) {
        throw new BadRequestException(`Question "${q.text}" requires non-empty options for DROPDOWN type`);
      }
      if (q.type !== SurveyQuestionType.DROPDOWN) {
        q.options = null as any;
      }
    });
    

    const survey = this.surveyRepo.create({
      ...dto,
      userId: user.id,
			projectId : projectId
    } as any);

    return await this.surveyRepo.save(survey);
  }

  async createFeedback(dto: CreateSurveyFeedbackDto) {
    const survey = await this.surveyRepo.findOne({
      where: { id: dto.surveyId },
      relations: ['questions'],
    });
    if (!survey) throw new NotFoundException('Survey not found');
    if (survey.questions.length === 0) {
      throw new BadRequestException('Survey has no questions');
    }

    const existingFeedback = await this.feedbackRepo.findOne({
      where: { survey: { id: dto.surveyId }, user: { id: dto.userId } },
    });
    if (existingFeedback) {
      throw new BadRequestException('You have already submitted feedback for this survey');
    }

    const qMap = new Map(survey.questions.map(q => [q.id, q]));

    for (const ans of dto.answers) {
      const q = qMap.get(ans.questionId);
      if (!q) throw new BadRequestException(`Question ${ans.questionId} is not part of this survey`);

      const val = ans.answer ?? '';

      if (q.type === SurveyQuestionType.DROPDOWN) {
        if (!q.options || q.options.length === 0) {
          throw new BadRequestException(`Question "${q.text}" has no options configured`);
        }
        if (!q.options.includes(val)) {
          throw new BadRequestException(`Invalid answer for "${q.text}". Expected one of: ${q.options.join(', ')}`);
        }
      }

      if (q.type === SurveyQuestionType.IMAGE) {
        const isHttpUrl = typeof val === 'string' && /^https?:\/\/\S+/i.test(val);
        const isDataUri = typeof val === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(val);
        if (!isHttpUrl && !isDataUri) {
          throw new BadRequestException(`Invalid image answer for "${q.text}". Provide a public URL (http/https) or data:image Base64.`);
        }
      }
    }

    const feedback = this.feedbackRepo.create({
      user: { id: dto.userId } as any,
      branch: { id: dto.branchId } as any,
      survey: { id: dto.surveyId } as any,
      answers: dto.answers.map(a =>
        this.answerRepo.create({
          question: { id: a.questionId } as any,
          answer: a.answer, // IMAGE: URL أو data URI
        }),
      ),
    });

    return await this.feedbackRepo.save(feedback);
  }

  async getFeedbackByPromoter(promoterId: string, projectId: string) {
    return await this.feedbackRepo.find({
      where: { 
        user: { id: promoterId },
        survey: { projectId } // Strict project filtering
      },
      relations: ['survey', 'answers', 'answers.question'],
    });
  }



  async findAll(): Promise<Survey[]> {
    return this.surveyRepo.find({ relations: ['questions'] });
  }

  async findOne(id: string): Promise<Survey> {
    const survey = await this.surveyRepo.findOne({ where: { id }, relations: ['questions'] });
    if (!survey) throw new NotFoundException('Survey not found');
    return survey;
  }

  async update(id: string, dto: UpdateSurveyDto): Promise<Survey> {
    const survey = await this.findOne(id);
    Object.assign(survey, dto);
    return this.surveyRepo.save(survey);
  }

  async remove(id: string, projectId: string): Promise<void> {
    const survey = await this.surveyRepo.findOne({ where: { id, projectId } });
    if (!survey) throw new NotFoundException('Survey not found in this project');
    await this.surveyRepo.softRemove(survey);
  }
}
