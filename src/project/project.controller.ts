import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Req, Query, Patch, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ProjectService } from './project.service';
import { AuthGuard } from '../auth/auth.guard';
import { CreateProjectDto, UpdateProjectDto } from 'dto/project.dto';
import { UUID } from 'crypto';
import { CRUD } from 'common/crud.service';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';

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
    console.log('here');
    return CRUD.findAll(this.projectService.projectRepo, 'project', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['branches', 'products', 'owner'], ['name', 'created_at'], query.filters);
  }

  // 🔹 Get teams of a specific project
 
  @Get(':projectId/teams')
  @Permissions(EPermission.PROJECT_READ)
  async getTeamsByProject(@Param('projectId') projectId: string , @Query() query:any) {
		const filters = {project_id: projectId , ...query.filters}
    return CRUD.findAll(
			this.projectService.userRepo, 
			'users', 
			query.search, 
			query.page, 
			query.limit, 
			query.sortBy, 
			query.sortOrder, 
			['role' ], 
			['name' , "email" , 'created_at'], 
			filters
		);

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
}
