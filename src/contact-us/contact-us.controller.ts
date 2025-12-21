import { Controller, Get, Post, Body, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ContactUsService } from './contact-us.service';
import { ContactUsDto } from '../../dto/contact-us.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { LangInterceptor } from 'common/interceptors/lang.interceptor';

@UseGuards(AuthGuard)
@UseInterceptors(LangInterceptor)
@Controller('contact-us')
export class ContactUsController {
  constructor(private readonly service: ContactUsService) {}

  @Post()
  async create(@Body() dto: ContactUsDto, @Req() req) {
    const lang = req.headers['lang']?.toLowerCase() || 'en';
    return this.service.create(dto, lang);
  }

  // 🔐 Admin only
  @Get()
  async findAll(@Req() req) {
    const lang = req.headers['lang']?.toLowerCase() || 'en';
    return this.service.findAll(lang);
  }
}
