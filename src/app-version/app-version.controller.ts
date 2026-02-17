import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppVersionService } from './app-version.service';
import { CreateAppVersionDto } from './dto/create-app-version.dto';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { AuthGuard } from 'src/auth/auth.guard';
import { UseGuards } from '@nestjs/common';

@Controller('app-version')
export class AppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  @Get()
  getUpdateInfo() {
    return this.appVersionService.getUpdateInfo();
  }
@UseGuards(AuthGuard)
  @Permissions(EPermission.ROLE_CREATE)
  @Post()
  createVersion(@Body() createAppVersionDto: CreateAppVersionDto) {
    return this.appVersionService.createVersion(createAppVersionDto);
  }
}
