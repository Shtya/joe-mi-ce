// src/projects/project-stats.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { ProjectStatsService } from './stats.service';
 import { ProjectStatsDto } from './stats.dto';

@Controller('stats')
export class ProjectStatsController {
  constructor(private readonly projectStatsService: ProjectStatsService) {}

  @Get(':projectId')
  async getProjectStats(
    @Param('projectId') projectId: string,
  ): Promise<ProjectStatsDto> {
    return this.projectStatsService.getProjectStats(projectId);
  }
}
