import { Controller, Post, Get, Param, Put, Delete, Body, Query, UseGuards } from '@nestjs/common';
import { CompetitorService } from './competitor.service';
import { CreateCompetitorDto, UpdateCompetitorDto } from 'dto/competitors.dto';
import { CRUD } from 'common/crud.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { UUID } from 'crypto';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';

@UseGuards(AuthGuard)
@Controller('competitors')
export class CompetitorController {
  constructor(private readonly competitorService: CompetitorService) {}

  // Create a new competitor
  @Post()
  @Permissions(EPermission.COMPETITOR_CREATE)
  async createCompetitor(@Body() dto: CreateCompetitorDto) {
    return await this.competitorService.createCompetitor(dto);
  }

  // Get all competitors
  @Get()
  @Permissions(EPermission.COMPETITOR_READ)
  async getCompetitors(@Query() query) {
    return CRUD.findAll(this.competitorService.competitorRepo, 'competitors', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['project'], ['name']);
  }

  // Get competitors by project
  @Get('by-project/:projectId')
  @Permissions(EPermission.COMPETITOR_READ)
  async getCompetitorsByProject(@Param('projectId') projectId: UUID, @Query() query) {
    return CRUD.findAll(this.competitorService.competitorRepo, 'competitors', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['project'], ['name'], { project: { id: projectId } });
  }

  // Get a specific competitor by ID
  @Get(':id')
  @Permissions(EPermission.COMPETITOR_READ)
  async getCompetitorById(@Param('id') id: string) {
    return await this.competitorService.getCompetitorById(id);
  }

  // Update a competitor by ID
  @Put(':id')
  @Permissions(EPermission.COMPETITOR_UPDATE)
  async updateCompetitor(@Param('id') id: string, @Body() dto: UpdateCompetitorDto) {
    return await this.competitorService.updateCompetitor(id, dto);
  }

  // Delete a competitor by ID
  @Delete(':id')
  @Permissions(EPermission.COMPETITOR_DELETE)
  async deleteCompetitor(@Param('id') id: string) {
    return CRUD.softDelete(this.competitorService.competitorRepo, 'competitors', id);
  }
}
