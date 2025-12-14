import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseService } from 'common/base.service';
import { UpdateProjectDto } from 'dto/project.dto';
import { Project } from 'entities/project.entity';
import { User } from 'entities/user.entity';
import { In, Repository } from 'typeorm';
import { UUID } from 'crypto';
import { ERole } from 'enums/Role.enum';
import { plainToInstance } from 'class-transformer';
import { Shift } from 'entities/employee/shift.entity';

@Injectable()
export class ProjectService extends BaseService<Project> {
  constructor(
    @InjectRepository(Project) public projectRepo: Repository<Project>,
    @InjectRepository(Shift) public shiftRepo: Repository<Shift>,
    @InjectRepository(User)
    public userRepo: Repository<User>,
  ) {
    super(projectRepo);
  }
  async findTeamsByProject(projectId: string): Promise<User[]> {
    return this.userRepo.find({
      where: {
        project_id: projectId,
      },
      relations: ['project', 'role'],
    });
  }

  async put(dto: UpdateProjectDto, updaterId: UUID): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { owner: { id: updaterId } },
      relations: ['owner'],
    });
    if (!project) throw new NotFoundException('Project not found');

    Object.assign(project, dto);
    return this.projectRepo.save(project);
  }

  async find(userId: any) {
    if (userId?.role.name != ERole.SUPERVISOR && userId?.role?.name != ERole.PROJECT_ADMIN) {
      throw new BadRequestException('you cannot access this route');
    }
    const projects = await this.projectRepo.find({
      where: {
        id: userId?.project?.id, // Fetch projects where the user is the owner
      },
      relations: ['owner', 'branches', 'products'], // Include related entities (branches, products)
    });

    // Check if projects exist for the given user
    if (!projects || projects.length === 0) {
      throw new NotFoundException('No projects found for this user');
    }

    // If projects are found, return the projects (can modify if you need to filter or transform them)
    return projects;
  }

  async findInfo(userId: any) {
    if (userId?.role?.name !== ERole.SUPERVISOR && userId?.role?.name !== ERole.SUPER_ADMIN && userId?.role?.name !== ERole.PROJECT_ADMIN) {
      throw new BadRequestException('you cannot access this route');
    }

    const projects = await this.projectRepo.find({
      where: { id: userId?.project?.id },
      relations: ['owner'],
    });

    if (!projects || projects.length === 0) {
      throw new NotFoundException('No projects found for this user');
    }
    const merged = {
      projects,
    };

    // حذف created_at / updated_at / deleted_at من أي مكان
    return JSON.parse(JSON.stringify(merged, (key, value) => (['created_at', 'updated_at', 'deleted_at'].includes(key) ? undefined : value)));
  }

  async inactivate(id: UUID): Promise<Project> {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    project.is_active = false;
    return this.projectRepo.save(project);
  }
}
