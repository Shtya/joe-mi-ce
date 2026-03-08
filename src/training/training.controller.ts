import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TrainingService } from './training.service';
import { trainingPdfUploadOptions } from './upload.config';
import { AuthGuard } from 'src/auth/auth.guard';
import { CreateTrainingDto } from 'dto/training.dto';
import { TrainingTranslationInterceptor } from './training.interceptor';
import { UsersService } from '../users/users.service';

@UseGuards(AuthGuard)
@Controller('training')
@UseInterceptors(TrainingTranslationInterceptor)
export class TrainingController {
  constructor(
    private readonly service: TrainingService,
    private readonly usersService: UsersService,
  ) {}

  @Get('project/my-info')
  async getByMyProject(@Req() req: any) {
    const projectId = await this.usersService.resolveProjectIdFromUser(req.user.id);
    return this.service.getByProject(projectId);
  }

  @Get('project/:projectId')
  async getByProject(@Param('projectId') projectId: string) {
    return this.service.getByProject(projectId);
  }

  @Get()
  async findAll() {
      return this.service.findAll();
  }

  @Post()
  async createOrUpdate(@Req() req: any,@Body() dto: CreateTrainingDto) {
    const projectId = await this.usersService.resolveProjectIdFromUser(req.user.id);
    return this.service.createOrUpdate(projectId,dto);
  }

  @Post('upload/my-info')
  @UseInterceptors(FileInterceptor('file', trainingPdfUploadOptions))
  async uploadMyPdf(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    const projectId = await this.usersService.resolveProjectIdFromUser(req.user.id);
    return this.service.savePdf(projectId, file.filename);
  }

  @Post('upload/:projectId')
  @UseInterceptors(FileInterceptor('file', trainingPdfUploadOptions))
  async uploadPdf(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.service.savePdf(projectId, file.filename);
  }
}
