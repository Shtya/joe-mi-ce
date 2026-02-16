// --- File: feedback/feedback.controller.ts ---
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFiles, Req } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { AuthGuard } from '../auth/auth.guard';
import { CreateFeedbackDto, UpdateFeedbackStatusDto } from 'dto/feedback.dto';
import { EPermission } from 'enums/Permissions.enum';
import { Permissions } from 'decorators/permissions.decorators';
import { FilesInterceptor } from '@nestjs/platform-express';
import { feedbackUploadOptions } from 'src/journey/upload.config';
import { CRUD } from 'common/crud.service';
import { Feedback } from 'entities/feedback.entity';
import { multerOptionsFeedbackTmp } from 'common/multer.config';

import { UsersService } from 'src/users/users.service';

@UseGuards(AuthGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @UseInterceptors(FilesInterceptor('files', 10, multerOptionsFeedbackTmp))
  async createFeedback(@UploadedFiles() files: Express.Multer.File[], @Body() dto: CreateFeedbackDto, @Req() req) {
    const attachmentUrls = files?.map(f => `/uploads/feedback/${f.filename}`) ?? [];
    return this.feedbackService.create(dto, attachmentUrls, req.user);
  }

  // List feedback with filters + pagination
  @Get()
  async getFeedbackList(@Query() query: any, @Query('page') page: number = 1, @Query('limit') limit: number = 10, @Query('search') search?: string, @Query('projectId') projectId?: string, @Query('userId') userId?: string, @Query('type') type?: string, @Query('is_resolved') is_resolved?: string, @Req() req?: any) {
    const filters: any = { ...query.filters };

    // Resolve project ID from user
    const resolvedProjectId = await this.usersService.resolveProjectIdFromUser(req.user.id);
    filters.project = { id: resolvedProjectId };

    if (userId) filters.user = { id: userId };
    if (type) filters.type = type;
    if (is_resolved !== undefined && is_resolved !== '') {
      // ?is_resolved=true | false
      filters.is_resolved = is_resolved === 'true';
    }

    return CRUD.findAllRelation<Feedback>(
      this.feedbackService.feedbackRepo, // repo exposed from service
      'feedback', // root alias
      search, // search string
      page,
      limit,
      'created_at', // sortBy
      'DESC',
      ['user', 'project', 'resolvedBy'], // relations
      ['message', 'type'], // searchFields
      filters,
    );
  }

  // Get single feedback
  @Get(':id')
  async getFeedback(@Param('id') id: string) {
    return this.feedbackService.findOne(id);
  }

  // Resolve / unresolve feedback
  @Patch(':id/resolve')
  async resolveFeedback(@Param('id') id: string, @Body() dto: UpdateFeedbackStatusDto, @Req() req) {
    return this.feedbackService.resolve(id, dto, req.user);
  }

  // Delete feedback
  @Delete(':id')
  async deleteFeedback(@Param('id') id: string) {
    return this.feedbackService.remove(id);
  }
}
