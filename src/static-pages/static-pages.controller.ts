import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StaticPagesService } from './static-pages.service';
import { pdfUploadOptions } from './upload.config';
import { AuthGuard } from 'src/auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('static-content')
export class StaticPagesController {
  constructor(private readonly service: StaticPagesService) {}

  @Get(':type')
  async getPage(@Param('type') type: string, @Req() req) {
    if (!type) throw new BadRequestException('Type is required');
    const lang = req.headers['lang']?.toLowerCase() || 'en';
    return this.service.getPage(type, lang);
  }

  @Post('upload/:type')
  @UseInterceptors(FileInterceptor('file', pdfUploadOptions))
  async uploadPdf(@Param('type') type: string, @UploadedFile() file: Express.Multer.File, @Req() req) {
    if (!file) throw new BadRequestException('File is required');
    if (!type) throw new BadRequestException('Type is required');
    const lang = req.headers['lang']?.toLowerCase() || 'en';
    return this.service.savePdf(type, file.filename, lang);
  }
}
