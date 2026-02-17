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

import { Chain } from 'entities/locations/chain.entity';
import { Journey, JourneyPlan } from 'entities/all_plans.entity';

@Injectable()
export class ProjectService extends BaseService<Project> {
  constructor(
    @InjectRepository(Project) public projectRepo: Repository<Project>,
    @InjectRepository(Shift) public shiftRepo: Repository<Shift>,
    @InjectRepository(User)
    public userRepo: Repository<User>,
    @InjectRepository(Chain)
    public chainRepo: Repository<Chain>,
    @InjectRepository(JourneyPlan)
    public journeyPlanRepo: Repository<JourneyPlan>,
    @InjectRepository(Journey)
    public journeyRepo: Repository<Journey>,
    private userService: UsersService
    
  ) {
    super(projectRepo);
  }

  async createProject(data: Partial<Project>): Promise<Project> {
      const project = await this.projectRepo.save(this.projectRepo.create(data));
      
      // Auto-create Roaming Chain
      const roamingChain = this.chainRepo.create({
          name: 'Roaming', // or any default name
          project: project,
      });
      await this.chainRepo.save(roamingChain);

      return project;
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
    const projectid = await this.userService.resolveProjectIdFromUser(userId.id)
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

  async resetProjectPlans(projectId: string): Promise<any> {
    // 1. Validate Project
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    // 2. Find existing plans
    const existingPlans = await this.journeyPlanRepo.find({
      where: { projectId: projectId },
      relations: ['journeys'], // Load journeys to unlink them
    });

    // 3. Unlink Journeys & Delete Plans
    // Optimization: We can do this in bulk or loop. 
    // Given the potentially large number of journeys, let's use QueryBuilder for unlinking.
    
    // Unlink all journeys associated with these plans (or directly by project if possible, but plans is safer)
    if (existingPlans.length > 0) {
      const planIds = existingPlans.map(p => p.id);
      
      // Bulk update journeys to set journeyPlanId = null
      await this.journeyRepo.createQueryBuilder()
        .update(Journey)
        .set({ journeyPlan: null })
        .where("journeyPlanId IN (:...planIds)", { planIds })
        .execute();

      // Now safe to delete plans
      await this.journeyPlanRepo.remove(existingPlans);
    }

    // 4. Create Shifts (Morning: 09:00-17:00, Night: 17:00-01:00)
    const shift1 = this.shiftRepo.create({
      name: 'Shift Morning',
      startTime: '13:00',
      endTime: '16:00',
      project: project,
    });

    const shift2 = this.shiftRepo.create({
      name: 'Shift Night',
      startTime: '21:00',
      endTime: '01:00',
      project: project,
    });

    const [savedShift1, savedShift2] = await this.shiftRepo.save([shift1, shift2]);

    // 5. Fetch Promoters & Supervisors
    const users = await this.userRepo.find({
      where: {
        project_id: projectId,
        role: {
          name: In([ERole.PROMOTER, ERole.SUPERVISOR]) 
          // Assuming ERole has these values. If not, string literals 'promoter', 'supervisor'
        }
      },
      relations: ['branch'] // We need branch to create a plan? 
      // JourneyPlan needs: user, branch, shift, projectId, days
      // Issue: User might not have a branch assigned directly or might find it via other means. 
      // User entity has `branch` relation. Let's use that.
    });

    // 6. Create New Plans
    const newPlans: JourneyPlan[] = [];
    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    for (const user of users) {
      if (!user.branch) {
        console.warn(`User ${user.id} (${user.username}) has no branch assigned. Skipping plan creation.`);
        continue;
      }

      // Plan for Shift 1
      newPlans.push(this.journeyPlanRepo.create({
        user: user,
        branch: user.branch,
        shift: savedShift1,
        projectId: projectId,
        days: days,
        createdBy: project.owner || user, // Fallback
      }));

      // Plan for Shift 2
      newPlans.push(this.journeyPlanRepo.create({
        user: user,
        branch: user.branch,
        shift: savedShift2,
        projectId: projectId,
        days: days,
        createdBy: project.owner || user,
      }));
    }

    await this.journeyPlanRepo.save(newPlans);

    return {
      message: 'Project plans reset successfully',
      deletedPlans: existingPlans.length,
      createdShifts: 2,
      createdPlans: newPlans.length
    };
  }

}
