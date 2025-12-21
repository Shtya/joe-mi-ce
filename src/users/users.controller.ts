// controllers/users.controller.ts
import { Controller, Get, Param, Query, UseGuards, Request, ParseUUIDPipe, UnauthorizedException } from '@nestjs/common';
import { UserResponseDto, UsersByBranchResponseDto, ProjectUsersResponseDto } from 'dto/users.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { UsersService } from './users.service';

@Controller('user')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Get current user profile (using token)
  @Get('profile')
  async getProfile(@Request() req): Promise<UserResponseDto> {
    return this.usersService.getUserProfile(req.user.id);
  }

  @Get('project')
  async getProjectUsers(@Request() req): Promise<ProjectUsersResponseDto> {
    return this.usersService.getProjectUsers(req?.user?.project?.id);
  }

  // Get users by branch in current user's project
  @Get('project/branches')
  async getUsersByBranches(@Request() req): Promise<UsersByBranchResponseDto[]> {
    return this.usersService.getUsersByBranches(req.user.project_id);
  }

  // Get users for a specific branch
  @Get('branch/:branchId')
  async getUsersByBranch(@Param('branchId', ParseUUIDPipe) branchId: string, @Request() req): Promise<UsersByBranchResponseDto> {
    return this.usersService.getUsersByBranch(branchId, req.user.project_id);
  }

  // Get specific user by ID (within same project)
  @Get(':userId')
  async getUserById(@Param('userId', ParseUUIDPipe) userId: string, @Request() req): Promise<UserResponseDto> {
    return this.usersService.getUserById(userId, req.user.project_id);
  }

  // Alternative: Get users with query parameter for branch
  @Get()
  async getUsers(@Query('branchId') branchId?: string, @Query('projectId') projectId?: string, @Request() req?) {
    if (branchId) {
      const projectIdToUse = projectId || req.user.project_id || req.user.project?.id;
      return this.usersService.getUsersByBranch(branchId, projectIdToUse);
    }

    // If projectId is provided, return all users in project
    if (projectId) {
      return this.usersService.getProjectUsers(projectId);
    }

    // Default: return users in current user's project
    return this.usersService.getUsersInProject(req.user.project_id);
  }

  @Get('project/promoters-supervisors')
async getPromotersAndSupervisors(@Request() req) {
  // 🔐 Resolve project strictly from DB user
  const projectId = await this.usersService.resolveProjectIdFromUser(
    req.user.id,
  );

  return this.usersService.getPromotersAndSupervisorsByProject(projectId);
}

}
