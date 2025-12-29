import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Req, Query, Patch, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ProjectService } from './project.service';
import { AuthGuard } from '../auth/auth.guard';
import { CreateProjectDto, UpdateProjectDto } from 'dto/project.dto';
import { UUID } from 'crypto';
import { CRUD } from 'common/crud.service';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { Brackets } from 'typeorm';

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  // 🔹 List all projects (super admin only)
  @Get('')
  @Permissions(EPermission.PROJECT_READ)
  async findAllProjects(@Req() req: any, @Query() query: any) {
    if (req.user.role?.name !== 'super_admin') {
      throw new ForbiddenException('Only super admin can view all projects');
    }

    return CRUD.findAll(this.projectService.projectRepo, 'project', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['branches', 'products', 'owner'], ['name', 'username','mobile'], query.filters);
  }

  // 🔹 Get teams of a specific project

  @Get(':projectId/teams')
  @Permissions(EPermission.PROJECT_READ)
  async getTeamsByProject(
    @Param('projectId') projectId: string,
    @Query() query: any,
    @Req() req: Request
  ) {


    // Parse bracket notation manually
    const parsedFilters = query;


    // Extract filters object
    let filters = parsedFilters['filters'] || {};

    // Add project_id
    filters = { ...filters, project_id: projectId };


    // Instead of using findAllWithSearchAndFilters, use the simpler approach:
    return this.getFilteredTeams(projectId, filters, parsedFilters, query);
  }

  private async getFilteredTeams(
    projectId: string,
    filters: any,
    parsedFilters: any,
    query: any
  ) {
    const page = parsedFilters['page'] || query.page || 1;
    const limit = parsedFilters['limit'] || query.limit || 10;
    const pageNumber = Number(page) || 1;
    const limitNumber = Number(limit) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    // Create query builder
    const qb = this.projectService.userRepo.createQueryBuilder('users')
      .leftJoinAndSelect('users.role', 'role')
      .skip(skip)
      .take(limitNumber);

    // Apply project_id filter
    qb.andWhere('users.project_id = :projectId', { projectId });
    console.log(projectId)
    // Apply role.name filter if present
    if (filters.role?.id) {
qb.andWhere('role.id = :roleId', {
  roleId: filters.role.id,
});
    }

    // Apply search if present
    const search = parsedFilters['search'] || query.search;
    if (search) {
      qb.andWhere(
        new Brackets(subQb => {
          subQb.orWhere('users.name ILIKE :search', { search: `%${search}%` })
                .orWhere('users.mobile ILIKE :search', { search: `%${search}%` })
                .orWhere('users.username ILIKE :search', { search: `%${search}%` });
        })
      );
    }

    // Apply sorting
    const sortBy = parsedFilters['sortBy'] || query.sortBy || 'created_at';
    const sortOrder = parsedFilters['sortOrder'] || query.sortOrder || 'DESC';
    qb.orderBy(`users.${sortBy}`, sortOrder);

    // Execute query
const dataQb = qb.clone();
const countQb = qb.clone();

const records = await dataQb
  .skip(skip)
  .take(limitNumber)
  .getMany();

const total = await countQb.getCount();
    return {
      total_records: total,
      current_page: pageNumber,
      per_page: limitNumber,
      records,
    };
  }

  // Helper method to parse bracket notation
  private parseBracketNotation(key: string): string[] {
    const parts = key.split('[');
    const path = [];

    for (const part of parts) {
      const cleaned = part.replace(/\]/g, '');
      if (cleaned) {
        path.push(cleaned);
      }
    }

    return path;
  }

  // Helper method to set nested value
  private setNestedValue(obj: any, path: string[], value: any) {
    let current = obj;

    for (let i = 0; i < path.length; i++) {
      const isLast = i === path.length - 1;

      if (isLast) {
        current[path[i]] = value;
      } else {
        if (!current[path[i]] || typeof current[path[i]] !== 'object') {
          current[path[i]] = {};
        }
        current = current[path[i]];
      }
    }
  }

  // 🔹 Get the current user's project
  @Get('my-project')
  @Permissions(EPermission.PROJECT_READ)
  async find(@Req() req: any) {
    return this.projectService.find(req?.user);
  }

  // 🔹 Get current user's project info
  @Get('my-info')
  async findInfo(@Req() req: any) {
    return this.projectService.findInfo(req?.user);
  }

  // 🔹 Update project (for owner)
  @Put('')
  @Permissions(EPermission.PROJECT_UPDATE)
  async update(@Body() dto: UpdateProjectDto, @Req() req: any) {
    return this.projectService.put(dto, req.user.id);
  }

  // 🔹 Soft delete project (super admin only)
  @Delete(':id')
  @Permissions(EPermission.PROJECT_DELETE)
  async delete(@Param('id') id: UUID, @Req() req: any) {
    if (req.user.role?.name !== 'super_admin') {
      throw new ForbiddenException('Only super admin can delete projects');
    }
    return CRUD.softDelete(this.projectService.projectRepo, 'project', id);
  }

  // 🔹 Inactivate project (super admin only)
  @Patch(':id/inactivate')
  @Permissions(EPermission.PROJECT_INACTIVATE)
  async inactivateProject(@Param('id') id: UUID, @Req() req: any) {
    if (req.user.role?.name !== 'super_admin') {
      throw new ForbiddenException('Only super admin can inactivate projects');
    }

    return this.projectService.inactivate(id);
  }
  @Get(':projectId')
@Permissions(EPermission.PROJECT_READ)
async findById(
  @Param('projectId') projectId: string,
  @Req() req: any,
) {
  return this.projectService.findByProjectId(projectId, req.user);
}

}
