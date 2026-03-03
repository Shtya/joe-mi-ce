import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
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

@UseGuards(AuthGuard)
@Controller('training')
@UseInterceptors(TrainingTranslationInterceptor)
export class TrainingController {
  constructor(private readonly service: TrainingService) {}

  @Get('project/:projectId')
  async getByProject(@Param('projectId') projectId: string) {
    return this.service.getByProject(projectId);
  }

  @Get()
  async findAll() {
      return this.service.findAll();
  }

  @Post()
  async createOrUpdate(@Body() dto: CreateTrainingDto) {
    return this.service.createOrUpdate(dto);
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
