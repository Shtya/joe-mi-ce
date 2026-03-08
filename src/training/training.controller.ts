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
  @UseInterceptors(FileInterceptor('file', trainingPdfUploadOptions))
  async create(
    @Req() req: any,
    @Body() dto: CreateTrainingDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const projectId = await this.usersService.resolveProjectIdFromUser(req.user.id);
    return this.service.create(projectId, dto, file?.filename);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('file', trainingPdfUploadOptions))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTrainingDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.update(id, dto, file?.filename);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
