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
import { UsersService } from 'src/users/users.service';

@Injectable()
export class ProjectService extends BaseService<Project> {
  constructor(
    @InjectRepository(Project) public projectRepo: Repository<Project>,
    @InjectRepository(Shift) public shiftRepo: Repository<Shift>,
    @InjectRepository(User)
    public userRepo: Repository<User>,
private userService: UsersService
    
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
        id: userId?.project?.id || userId?.project_id, // Fetch projects where the user is the owner
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
    const projectid = await this.userService.resolveProjectIdFromUser(userId)
    const projects = await this.projectRepo.find({
      where: { id: projectid },
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
  async findByProjectId(projectId: string, user: User) {
  const project = await this.projectRepo.findOne({
    where: { id: projectId },
    relations: ['owner', 'branches', 'products'],
  });

  const userfind = await this.userRepo.findOne({where:{id:user.id},relations:['project','role']})
  if(!userfind){
        throw new NotFoundException('User is not found');

  }

  if (!project) {
    throw new NotFoundException('Project not found');
  }

  // 🔒 Authorization
  if (
    userfind.role?.name !== ERole.SUPER_ADMIN &&
    userfind.project_id !== projectId &&
    userfind.project.id !== projectId 

  ) {
    throw new ForbiddenException('You cannot access this project');
  }

  return project;
}

}
