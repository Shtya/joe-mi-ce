import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseService } from 'common/base.service';
import { UpdateProjectDto } from 'dto/project.dto';
import { Project } from 'entities/project.entity';
import { User } from 'entities/user.entity';
import { In, Not, Repository } from 'typeorm';
import { UUID } from 'crypto';
import { ERole } from 'enums/Role.enum';
import { plainToInstance } from 'class-transformer';
import { Shift } from 'entities/employee/shift.entity';
import { UsersService } from 'src/users/users.service';

import { Chain } from 'entities/locations/chain.entity';
import { Branch } from 'entities/branch.entity';
import { Journey, JourneyPlan, JourneyType } from 'entities/all_plans.entity';

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
    @InjectRepository(Branch)
    public branchRepo: Repository<Branch>,
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

    // 2. Delete all journeys created for 'today'
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    await this.journeyRepo.delete({
      projectId: projectId,
      date: todayStr,
    });

    console.log(`Deleted all journeys for project ${projectId} on date ${todayStr}`);

    // 3. Find existing plans
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

    // 5. Fetch branches, users, and historical associations
    const branches = await this.branchRepo.find({
      where: { project: { id: projectId } as any },
      relations: ['supervisor', 'supervisors'],
    });

    const users = await this.userRepo.find({
      where: {
        project_id: projectId,
        role: {
          name: Not(In([ERole.SUPER_ADMIN, ERole.PROJECT_ADMIN]))
        }
      },
      relations: ['branch']
    });

    // Calculate yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Fetch historical user-branch associations from yesterday's journeys
    // We only care about PLANNED journeys to replicate the schedule. Unplanned visits should not become permanent plans.
    const historicalAssociations = await this.journeyRepo.createQueryBuilder('journey')
      .leftJoin('journey.branch', 'branch')
      .select('journey.userId', 'userId')
      .addSelect('branch.id', 'branchId')
      .where('journey.projectId = :projectId', { projectId })
      .andWhere('journey.date = :yesterdayStr', { yesterdayStr })
      .andWhere('journey.type = :type', { type: JourneyType.PLANNED })
      .distinct(true)
      .getRawMany();

    console.log(`Resetting plans for project ${projectId}. Found ${users.length} users, ${branches.length} branches, and ${historicalAssociations.length} PLANNED associations from yesterday (${yesterdayStr}).`);

    // 6. Create New Plans
    const newPlans: JourneyPlan[] = [];
    const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    for (const user of users) {
      const branchIds = new Set<string>();
      
      // Case 1: Direct branch assignment
      if (user.branch) {
        branchIds.add(user.branch.id);
      }

      // Case 2: User is a supervisor for one or more branches
      const supervised = branches.filter(b => 
        b.supervisor?.id === user.id || 
        b.supervisors?.some(s => s.id === user.id)
      );
      supervised.forEach(b => branchIds.add(b.id));

      // Case 3: Historical associations (based on past journeys)
      const historical = historicalAssociations
        .filter(h => h.userId === user.id || h.journey_userId === user.id)
        .map(h => h.branchId || h.journey_branchId);
      
      historical.forEach(bid => {
        if (bid) branchIds.add(bid);
      });

      if (branchIds.size === 0) {
        console.warn(`User ${user.id} (${user.username}) skipped: No associated branch found.`);
        continue;
      }

      for (const branchId of branchIds) {
        const branch = branches.find(b => b.id === branchId);
        if (!branch) continue;

        // Plan for Shift 1
        newPlans.push(this.journeyPlanRepo.create({
          user: user,
          branch: branch,
          shift: savedShift1,
          projectId: projectId,
          days: days,
          createdBy: project.owner || user,
        }));

        // Plan for Shift 2
        newPlans.push(this.journeyPlanRepo.create({
          user: user,
          branch: branch,
          shift: savedShift2,
          projectId: projectId,
          days: days,
          createdBy: project.owner || user,
        }));
      }
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
