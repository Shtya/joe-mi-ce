import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppVersionService } from './app-version.service';
import { CreateAppVersionDto } from './dto/create-app-version.dto';

@Controller('app-version')
export class AppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  @Get()
  getUpdateInfo() {
    return this.appVersionService.getUpdateInfo();
  }

  @Post()
  createVersion(@Body() createAppVersionDto: CreateAppVersionDto) {
    return this.appVersionService.createVersion(createAppVersionDto);
  }
}
