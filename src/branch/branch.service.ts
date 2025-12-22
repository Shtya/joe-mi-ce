/**
 * when add supervisor check if this user exist in any where or no
 * when add teams check if this id of the user is exist in any where or no
 */

import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AssignPromoterDto, CreateBranchDto, UpdateBranchDto } from 'dto/branch.dto';
import { Branch } from 'entities/branch.entity';
import { Chain } from 'entities/locations/chain.entity';
import { City } from 'entities/locations/city.entity';
import { Project } from 'entities/project.entity';
import { Repository } from 'typeorm';
import { User } from 'entities/user.entity';
import { ERole } from 'enums/Role.enum';
import { SalesTarget, SalesTargetType } from 'entities/sales-target.entity';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch) readonly branchRepo: Repository<Branch>,
    @InjectRepository(Project) readonly projectRepo: Repository<Project>,
    @InjectRepository(City) readonly cityRepo: Repository<City>,
    @InjectRepository(Chain) readonly chainRepo: Repository<Chain>,
    @InjectRepository(User) readonly userRepo: Repository<User>,
    @InjectRepository(SalesTarget) readonly salesTargetRepo: Repository<SalesTarget>,
         readonly usersService: UsersService,

  ) {}
  async create(dto: CreateBranchDto, user: User): Promise<Branch> {
    if (user.role?.name !== ERole.PROJECT_ADMIN) {
      throw new ForbiddenException('Only the admin can create branches');
    }
    const userdata = await this.usersService.resolveUserWithProject(user.id)

    const project = await this.projectRepo.findOne({
      where: { id: userdata.project?.id  || userdata.project_id},
      relations: ['owner'],
    });
    if (!project) throw new NotFoundException('Project not found');

    const existingBranch = await this.branchRepo.findOne({
      where: { name: dto.name, project: { id: userdata.project?.id || userdata.project_id}},
    });
    if (existingBranch) throw new ConflictException('Branch name must be unique within the project');

    const city = await this.cityRepo.findOneByOrFail({ id: dto.cityId });
    const chain = dto.chainId ? await this.chainRepo.findOneBy({ id: dto.chainId }) : null;

    const projectBranches = await this.branchRepo.find({
      where: { project: { id: project.id } },
      relations: ['supervisor', 'team'],
    });
function getTargetStartAndEnd(startMonthDate: Date = new Date()) {
  const startDate = new Date(startMonthDate.getFullYear(), startMonthDate.getMonth(), 1);

  // End date: 3 months later minus 1 day
  const endDate = new Date(startMonthDate.getFullYear(), startMonthDate.getMonth() + 3, 0);

  return { startDate, endDate };
}


    // Supervisor duplication check
    if (dto.supervisorId) {
      const isSupervisorTaken = projectBranches.some(b => b.supervisor?.id === dto.supervisorId);
      const isInTeam = projectBranches.some(b => b.team?.some(user => user.id === dto.supervisorId));
      if (isSupervisorTaken || isInTeam) {
        throw new ConflictException('Supervisor is already assigned to another branch');
      }
    }

    // Team duplication check
    if (dto.teamIds && dto.teamIds.length > 0) {
      for (const teamId of dto.teamIds) {
        const isTeamTaken = projectBranches.some(b => b.team?.some(user => user.id === teamId));
        const isSupervisor = projectBranches.some(b => b.supervisor?.id === teamId);
        if (isTeamTaken || isSupervisor) {
          throw new ConflictException(`User with ID ${teamId} is already assigned to another branch`);
        }
      }
    }

    const supervisor = dto.supervisorId ? await this.userRepo.findOneBy({ id: dto.supervisorId }) : null;
    let team: User[] = [];

    if (dto.teamIds && dto.teamIds.length > 0) {
      team = await this.userRepo.findByIds(dto.teamIds);
    }

    // ✅ Add supervisor to team if not already in it
    if (supervisor && !team.some(user => user.id === supervisor.id)) {
      team.push(supervisor);
    }

    // ✅ Assign project ID to supervisor and team members
    if (supervisor) {
      supervisor.project_id = project.id;
      await this.userRepo.save(supervisor);
    }

    if (team.length > 0) {
      for (const teamMember of team) {
        teamMember.project_id = project.id;
      }
      await this.userRepo.save(team);
    }
function parseGeoString(value: string): { lat: number; lng: number } {
  if (!value) throw new BadRequestException('No geo value');

  const parts = value.split(',').map(s => Number(s.trim()));
  if (parts.length !== 2 || parts.some(isNaN)) {
    throw new BadRequestException('Invalid geo format, expected "lat,lng"');
  }

  return { lat: parts[0], lng: parts[1] };
}

    const branch = this.branchRepo.create({
      name: dto.name,
 geo: dto.geo ? parseGeoString(dto.geo) : null,
      geofence_radius_meters: dto.geofence_radius_meters ?? 500,
      image_url: dto.image_url,
      project,
      city,
      chain,
      supervisor,
      team,
      salesTargetType: dto.salesTargetType ?? SalesTargetType.QUARTERLY,
      autoCreateSalesTargets: dto.autoCreateSalesTargets ?? true,
      defaultSalesTargetAmount: dto.defaultSalesTargetAmount ?? 0
    });

    const savedBranch = await this.branchRepo.save(branch);

    if (savedBranch.autoCreateSalesTargets ) {
      const { startDate, endDate } = getTargetStartAndEnd();

      const salesTarget = this.salesTargetRepo.create({
        branch: savedBranch,
        type: savedBranch.salesTargetType,
        name:`default target ${dto.name}`,
        startDate,
        endDate,
        description: `this is the deafault target of the branch ${dto.name} and the target is ${dto.defaultSalesTargetAmount}`,
        targetAmount: savedBranch.defaultSalesTargetAmount,
        autoRenew: savedBranch.autoCreateSalesTargets,
      });

      await this.salesTargetRepo.save(salesTarget);
    }

    return savedBranch;
  }

  async assignSupervisor(branchId: string, userId: string, user: User): Promise<Branch> {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId },
      relations: ['project', 'project.owner', 'supervisor', 'team'],
    });
    if (!branch) throw new NotFoundException('Branch not found');
    if (branch.supervisor) {
      throw new ConflictException('This branch already has a supervisor assigned');
    }

    // Check if user is already in the team
    if (branch.team.some(teamMember => teamMember.id === userId)) {
      throw new ConflictException('This user is already a team member in this branch');
    }

    const supervisor = await this.userRepo.findOneByOrFail({ id: userId });

    // Check if supervisor is already assigned elsewhere in the project
    const projectBranches = await this.branchRepo.find({
      where: { project: { id: branch.project.id } },
      relations: ['supervisor', 'team'],
    });

    const isSupervisorTaken = projectBranches.some(b =>
      b.id !== branchId && b.supervisor?.id === userId
    );
    const isInTeamElsewhere = projectBranches.some(b =>
      b.id !== branchId && b.team?.some(user => user.id === userId)
    );

    if (isSupervisorTaken || isInTeamElsewhere) {
      throw new ConflictException('User is already assigned to another branch in this project');
    }

    // ✅ Assign project ID to supervisor
    supervisor.project_id = branch.project.id;
    await this.userRepo.save(supervisor);

    // ✅ Add supervisor to team if not already there
    if (!branch.team.some(teamMember => teamMember.id === supervisor.id)) {
      branch.team.push(supervisor);
    }

    branch.supervisor = supervisor;
    return this.branchRepo.save(branch);
  }

  async assignPromoter(projectId: string, branchId: string, dto: AssignPromoterDto, currentUser: User): Promise<{ message: string }> {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId },
      relations: ['project', 'project.owner', 'team'],
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.project.id !== projectId) {
      throw new BadRequestException('Branch does not belong to this project');
    }

    // ✅ Correct ownership check
    if (branch.project.owner.id !== currentUser.id) {
      throw new ForbiddenException('You do not own this project');
    }

    const promoter = await this.userRepo.findOne({
      where: { id: dto.promoterId },
      relations: ['role'],
    });

    if (!promoter) {
      throw new NotFoundException('Promoter user not found');
    }

    if (promoter.role?.name !== ERole.PROMOTER) {
      throw new BadRequestException('User is not a promoter');
    }

    // ✅ Check if already assigned to this branch
    if (branch.team.some(user => user.id === promoter.id)) {
      throw new BadRequestException('Promoter already assigned to this branch');
    }

    // ✅ Check if promoter is already assigned to another branch in the same project
    const projectBranches = await this.branchRepo.find({
      where: { project: { id: projectId } },
      relations: ['team', 'supervisor'],
    });

    const isAlreadyAssignedElsewhere = projectBranches.some(b =>
      b.id !== branch.id && (
        b.team.some(user => user.id === promoter.id) ||
        b.supervisor?.id === promoter.id
      )
    );

    if (isAlreadyAssignedElsewhere) {
      throw new ConflictException('This user is already assigned to another branch of the project');
    }

    // ✅ Assign project ID to promoter
    promoter.project_id = branch.project.id;
    await this.userRepo.save(promoter);

    // ✅ Add promoter to team
    branch.team.push(promoter);
    await this.branchRepo.save(branch);

    return { message: 'Promoter assigned successfully' };
  }

  async update(id: string, dto: UpdateBranchDto, user: User): Promise<Branch> {
    const branch = await this.branchRepo.findOne({
      where: { id },
      relations: ['project', 'project.owner', 'supervisor', 'team']
    });

    if (!branch) throw new NotFoundException('Branch not found');
    if (branch.project.id !== user.project_id || user.project.id) throw new ForbiddenException('Access denied');

    // Check for supervisor or team changes
    if (dto.supervisorId || dto.teamIds) {
      const projectBranches = await this.branchRepo.find({
        where: { project: { id: branch.project.id } },
        relations: ['supervisor', 'team'],
      });

      // Handle supervisor update
      if (dto.supervisorId && dto.supervisorId !== branch.supervisor?.id) {
        const newSupervisor = await this.userRepo.findOneByOrFail({ id: dto.supervisorId });

        // Check if new supervisor is already assigned elsewhere
        const isSupervisorTaken = projectBranches.some(b =>
          b.id !== id && b.supervisor?.id === dto.supervisorId
        );
        const isInTeamElsewhere = projectBranches.some(b =>
          b.id !== id && b.team?.some(user => user.id === dto.supervisorId)
        );

        if (isSupervisorTaken || isInTeamElsewhere) {
          throw new ConflictException('New supervisor is already assigned to another branch');
        }

        // Update project ID for new supervisor
        newSupervisor.project_id = branch.project.id;
        await this.userRepo.save(newSupervisor);

        // Add new supervisor to team if not already there
        if (!branch.team.some(teamMember => teamMember.id === newSupervisor.id)) {
          branch.team.push(newSupervisor);
        }

        branch.supervisor = newSupervisor;
      }

      // Handle team updates
      if (dto.teamIds) {
        const newTeamIds = dto.teamIds;
        const currentTeamIds = branch.team.map(user => user.id);

        // Find users to add
        const usersToAdd = newTeamIds.filter(id => !currentTeamIds.includes(id));
        const usersToRemove = currentTeamIds.filter(id => !newTeamIds.includes(id));

        // Check if any users to add are already assigned elsewhere
        for (const userId of usersToAdd) {
          const isUserTaken = projectBranches.some(b =>
            b.id !== id && (
              b.team?.some(user => user.id === userId) ||
              b.supervisor?.id === userId
            )
          );

          if (isUserTaken) {
            throw new ConflictException(`User with ID ${userId} is already assigned to another branch`);
          }
        }

        // Add new users to team
        if (usersToAdd.length > 0) {
          const newTeamMembers = await this.userRepo.findByIds(usersToAdd);

          // Update project ID for new team members
          for (const teamMember of newTeamMembers) {
            teamMember.project_id = branch.project.id;
          }
          await this.userRepo.save(newTeamMembers);

          branch.team = [...branch.team, ...newTeamMembers];
        }

        // Remove users from team
        if (usersToRemove.length > 0) {
          branch.team = branch.team.filter(user => !usersToRemove.includes(user.id));
        }
      }
    }

    // Update other branch properties
    if (dto.cityId) branch.city = await this.cityRepo.findOneByOrFail({ id: dto.cityId });
    if (dto.chainId !== undefined) branch.chain = dto.chainId ? await this.chainRepo.findOneBy({ id: dto.chainId }) : null;
    if (dto.name) branch.name = dto.name;
if (dto.geo) {
  branch.geo = {
    lat: dto.geo.lat,
    lng: dto.geo.lng,
  };
}
    if (dto.geofence_radius_meters !== undefined) branch.geofence_radius_meters = dto.geofence_radius_meters;
    if (dto.image_url !== undefined) branch.image_url = dto.image_url;

    return this.branchRepo.save(branch);
  }

  async findOne(id: string): Promise<Branch> {
    const branch = await this.branchRepo.findOne({ where: { id }, relations: ['project', 'city', 'chain', 'supervisor', 'team'] });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async findAllbyProject(projectid: string): Promise<Branch[]> {
    if (!projectid) {
      throw new BadRequestException("there are not project id assiing")
    }

    const branch = await this.branchRepo
      .createQueryBuilder('branch')
      .select(['branch.id', 'branch.name'])
      .where('branch.projectId = :projectid', { projectid })
      .getMany();

    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

async remove(id: string, user: User) {
  return this.branchRepo.manager.transaction(async (transactionalEntityManager) => {
    const branch = await transactionalEntityManager.findOne(Branch, {
      where: { id },
      relations: ['project', 'project.owner', 'team', 'supervisor']
    });

    if (!branch) throw new NotFoundException('Branch not found');

    if (branch.project.owner.id !== user.id) {
      throw new ForbiddenException('Access denied - only project owner can remove branches');
    }

    // Clear project_id from users
    const usersToClear = [];

    if (branch.team && branch.team.length > 0) {
      usersToClear.push(...branch.team);
    }

    if (branch.supervisor) {
      if (!usersToClear.some(u => u.id === branch.supervisor.id)) {
        usersToClear.push(branch.supervisor);
      }
    }

    if (usersToClear.length > 0) {
      for (const userToClear of usersToClear) {
        userToClear.project_id = null;
      }
      await transactionalEntityManager.save(User, usersToClear);
    }

    // Remove the branch
    await transactionalEntityManager.softRemove(Branch, branch);

    return { message: 'Branch removed successfully' };
  });
}
}