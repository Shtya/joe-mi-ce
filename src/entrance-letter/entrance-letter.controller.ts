import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { EntranceLetterService } from './entrance-letter.service';
import { CreateEntranceLetterDto } from '../../dto/entrance-letter/create-entrance-letter.dto';
import { UpdateEntranceLetterStatusDto } from '../../dto/entrance-letter/update-entrance-letter-status.dto';
import { EEntranceLetterStatus } from '../../entities/entrance-letter.entity';
import { AuthGuard } from '../auth/auth.guard';
import { Permissions } from '../../decorators/permissions.decorators';
import { ERole } from '../../enums/Role.enum';

@Controller('api/v1/entrance-letters')
@UseGuards(AuthGuard)
export class EntranceLetterController {
  constructor(private readonly entranceLetterService: EntranceLetterService) {}

  @Post()
  async create(@Req() req, @Body() dto: CreateEntranceLetterDto) {
    return await this.entranceLetterService.create(req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req, @Query('status') status?: EEntranceLetterStatus) {
    return await this.entranceLetterService.findAll(req.user, status);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.entranceLetterService.findOne(id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: UpdateEntranceLetterStatusDto,
  ) {
    return await this.entranceLetterService.updateStatus(id, req.user.id, dto);
  }
}
