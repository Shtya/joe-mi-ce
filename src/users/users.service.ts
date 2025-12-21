// services/users.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Project } from 'entities/project.entity';
import { UserResponseDto, UsersByBranchResponseDto, ProjectUsersResponseDto } from 'dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  async getUserProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['role', 'branch','project'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.mapUserToDto(user);
  }
async resolveUserWithProject(userId: string) {
  const user = await this.userRepository.findOne({
    where: { id: userId },
    relations: ['project', 'branch', 'branch.project'],
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  return user;
}
  async getUserById(userId: string, projectId: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: {
        id: userId,
        project_id: projectId,
      },
      relations: ['role', 'branch'],
    });

    if (!user) {
      throw new NotFoundException('User not found in this project');
    }

    return this.mapUserToDto(user);
  }

  async getProjectUsers(projectId: string): Promise<ProjectUsersResponseDto> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['branches'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const branchesWithUsers = await this.getUsersByBranches(projectId);
    const totalUsers = branchesWithUsers.reduce((total, branch) => total + branch.users.length, 0);

    return {
      projectId: project.id,
      projectName: project.name,
      branches: branchesWithUsers,
      totalUsers,
    };
  }

  async getUsersByBranches(projectId: string): Promise<UsersByBranchResponseDto[]> {
    const branches = await this.branchRepository.find({
      where: { project: { id: projectId } },
      relations: ['team', 'team.role'],
    });

    return branches.map(branch => ({
      branchId: branch.id,
      branchName: branch.name,
      users: branch.team.map(user => this.mapUserToDto(user)),
    }));
  }

  async getUsersByBranch(branchId: string, projectId: string): Promise<UsersByBranchResponseDto> {
    const branch = await this.branchRepository.findOne({
      where: {
        id: branchId,
        project: { id: projectId },
      },
      relations: ['team', 'team.role'],
    });

    if (!branch) {
      throw new NotFoundException('Branch not found in this project');
    }

    return {
      branchId: branch.id,
      branchName: branch.name,
      users: branch.team.map(user => this.mapUserToDto(user)),
    };
  }

  async getUsersInProject(projectId: string): Promise<UserResponseDto[]> {
    const users = await this.userRepository.find({
      where: { project_id: projectId },
      relations: ['role', 'branch'],
    });

    return users.map(user => this.mapUserToDto(user));
  }

  private mapUserToDto(user: User): UserResponseDto {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      mobile: user.mobile,
      avatar_url: user.avatar_url,
      device_id: user.device_id,
      is_active: user.is_active,
      role: user.role?.name,
      branch: user.branch
        ? {
            id: user.branch.id,
            name: user.branch.name,
          }
        : undefined,

      created_at: user.created_at,
    };
  }
async getPromotersAndSupervisorsByProject(
  projectId: string,
): Promise<UserResponseDto[]> {
  const users = await this.userRepository.find({
    where: {
      project_id: projectId,
      role: {
        name: In(['promoter', 'supervisor']),
      },
    },
    relations: ['role', 'branch'],
  });

  return users.map(user => this.mapUserToDto(user));
}

async resolveProjectIdFromUser(userId: string): Promise<string> {
  const user = await this.userRepository.findOne({
    where: { id: userId },
    relations: ['branch', 'branch.project', 'project'],
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  // Priority:
  // 1️⃣ Direct project on user
  if (user.project) {
    return user.project?.id || user.project_id;
  }

  // 2️⃣ Project via branch
  if (user.branch?.project) {
    return user.branch.project.id;
  }

  throw new ForbiddenException('User is not assigned to any project');
}
  async deleteUser(
    userId: string,
    lang: 'ar' | 'en' = 'en',
  ): Promise<{ success: boolean; code: number; message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException(
        lang === 'ar' ? 'المستخدم غير موجود' : 'User not found',
      );
    }

    await this.userRepository.softRemove(user);

    return {
      success: true,
      code: 200,
      message:
        lang === 'ar' ? 'تم حذف المستخدم بنجاح' : 'User deleted successfully',
    };
  }
}