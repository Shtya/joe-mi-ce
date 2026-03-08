import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { CreateTrainingDto, UpdateTrainingDto } from 'dto/training.dto';
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

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateTrainingDto) {
    const projectId = await this.usersService.resolveProjectIdFromUser(req.user.id);
    return this.service.create(projectId, dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTrainingDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Post('upload/my-info/:id')
  @UseInterceptors(FileInterceptor('file', trainingPdfUploadOptions))
  async uploadMyPdf(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.service.savePdf(id, file.filename);
  }

  @Post('upload/:id')
  @UseInterceptors(FileInterceptor('file', trainingPdfUploadOptions))
  async uploadPdf(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.service.savePdf(id, file.filename);
  }
}
