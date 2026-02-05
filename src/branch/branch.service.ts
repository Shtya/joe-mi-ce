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
import { Repository, In } from 'typeorm';
import { User } from 'entities/user.entity';
import { ERole } from 'enums/Role.enum';
import { SalesTarget, SalesTargetStatus, SalesTargetType } from 'entities/sales-target.entity';
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
      relations: ['supervisor', 'team', 'supervisors'],
    });

    function getTargetStartAndEnd(startMonthDate: Date = new Date()) {
      const startDate = new Date(startMonthDate.getFullYear(), startMonthDate.getMonth(), 1);
      // End date: 3 months later minus 1 day
      const endDate = new Date(startMonthDate.getFullYear(), startMonthDate.getMonth() + 3, 0);
      return { startDate, endDate };
    }

    // Collect all supervisor IDs (legacy + new)
    const allSupervisorIds = new Set<string>();
    if (dto.supervisorId) allSupervisorIds.add(dto.supervisorId);
    if (dto.supervisorIds) dto.supervisorIds.forEach(id => allSupervisorIds.add(id));

    // Supervisor duplication check
    for (const supId of allSupervisorIds) {
      const isSupervisorTaken = projectBranches.some(b => 
        (b.supervisor?.id === supId) || 
        (b.supervisors?.some(s => s.id === supId))
      );
      const isInTeam = projectBranches.some(b => b.team?.some(user => user.id === supId));
      
      // if (isSupervisorTaken || isInTeam) {
      //   throw new ConflictException(`Supervisor with ID ${supId} is already assigned to another branch`);
      // }
    }

    // Team duplication check
    if (dto.teamIds && dto.teamIds.length > 0) {
      for (const teamId of dto.teamIds) {
        const isTeamTaken = projectBranches.some(b => b.team?.some(user => user.id === teamId));
        // Check if team member is assigned as supervisor elsewhere
        const isSupervisor = projectBranches.some(b => 
          (b.supervisor?.id === teamId) ||
          (b.supervisors?.some(s => s.id === teamId))
        );
        // if (isTeamTaken || isSupervisor) {
        //   throw new ConflictException(`User with ID ${teamId} is already assigned to another branch`);
        // }
      }
    }

    let supervisors: User[] = [];
    if (allSupervisorIds.size > 0) {
      supervisors = await this.userRepo.find({ where: { id: In(Array.from(allSupervisorIds)) } });
    }

    // Use the first supervisor as the legacy 'supervisor' field
    const legacySupervisor = supervisors.length > 0 ? supervisors[0] : null;

    let team: User[] = [];
    if (dto.teamIds && dto.teamIds.length > 0) {
      team = await this.userRepo.findByIds(dto.teamIds);
    }

    // ✅ Add supervisors to team if not already in it
    for (const sup of supervisors) {
      if (!team.some(user => user.id === sup.id)) {
        team.push(sup);
      }
    }

    // ✅ Assign project ID to supervisors and team members
    for (const sup of supervisors) {
      sup.project_id = project.id;
      await this.userRepo.save(sup);
    }

    if (team.length > 0) {
      for (const teamMember of team) {
        teamMember.project_id = project.id;
      }
      await this.userRepo.save(team);
    }

    const branch = this.branchRepo.create({
      name: dto.name,
      geo: this.parseGeo(dto.geo),
      geofence_radius_meters: dto.geofence_radius_meters ?? 500,
      image_url: dto.image_url,
      project,
      city,
      chain,
      supervisor: legacySupervisor, // Legacy field
      supervisors: supervisors,     // New field
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
        project: savedBranch.project,
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
      relations: ['project', 'project.owner', 'supervisor', 'team', 'supervisors']
    });

    if (!branch) throw new NotFoundException('Branch not found');
    const projctId = await this.usersService.resolveProjectIdFromUser(user.id)
    if (branch.project?.id !== projctId) throw new ForbiddenException('Access denied');

    if (dto.geo !== undefined) {
      branch.geo = this.parseGeo(dto.geo);
    }

    // Check for supervisor or team changes
    if (dto.supervisorId || dto.supervisorIds || dto.teamIds) {
      const projectBranches = await this.branchRepo.find({
        where: { project: { id: branch.project.id } },
        relations: ['supervisor', 'team', 'supervisors'],
      });

      // Handle supervisor update
      if (dto.supervisorId || dto.supervisorIds) {
        // Collect desired supervisor IDs
        const newSupervisorIds = new Set<string>();
        if (dto.supervisorIds) dto.supervisorIds.forEach(id => newSupervisorIds.add(id));
        if (dto.supervisorId) newSupervisorIds.add(dto.supervisorId);

        // If neither provided (empty update), we might skip or clear. 
        // Assuming partial update: if provided, replace. 
        // If passed explicit empty array, clear supervisors.
        
        let targetSupervisors: User[] = [];
        if (newSupervisorIds.size > 0) {
           targetSupervisors = await this.userRepo.find({ where: { id: In(Array.from(newSupervisorIds)) } });
           if (targetSupervisors.length !== newSupervisorIds.size) {
             throw new NotFoundException('Some supervisors not found');
           }
        }

        // Check if new supervisors are assigned elsewhere
        for (const sup of targetSupervisors) {
          // Check other branches
          const isTaken = projectBranches.some(b => 
            b.id !== id && (
              b.supervisor?.id === sup.id || 
              b.supervisors?.some(s => s.id === sup.id)
            )
          );
          // Check if in team of other branches
          const isInTeamElsewhere = projectBranches.some(b => 
            b.id !== id && b.team?.some(t => t.id === sup.id)
          );

          // if (isTaken || isInTeamElsewhere) {
          //   throw new ConflictException(`Supervisor ${sup.name || sup.id} is already assigned to another branch`);
          // }
        }

        // Update project ID
        for (const sup of targetSupervisors) {
          sup.project_id = branch.project.id;
          await this.userRepo.save(sup);
        }

        // Add metadata to branch
        branch.supervisors = targetSupervisors;
        // Legacy support
        branch.supervisor = targetSupervisors.length > 0 ? targetSupervisors[0] : null;

        // Ensure they are in the team
         if (!branch.team) branch.team = [];
         for (const sup of targetSupervisors) {
           if (!branch.team.some(t => t.id === sup.id)) {
             branch.team.push(sup);
           }
         }
      }

      // Handle team updates
      if (dto.teamIds) {
        const newTeamIds = dto.teamIds;
        const currentTeamIds = branch.team.map(user => user.id);

        // Find users to add
        const usersToAdd = newTeamIds.filter(id => !currentTeamIds.includes(id));
        const usersToRemove = currentTeamIds.filter(id => !newTeamIds.includes(id));

        // Check availability
        for (const userId of usersToAdd) {
          const isUserTaken = projectBranches.some(b =>
            b.id !== id && (
              b.team?.some(user => user.id === userId) ||
              b.supervisor?.id === userId ||
              b.supervisors?.some(s => s.id === userId)
            )
          );

          if (isUserTaken) {
            throw new ConflictException(`User with ID ${userId} is already assigned to another branch`);
          }
        }

        // Add new users
        if (usersToAdd.length > 0) {
          const newTeamMembers = await this.userRepo.findByIds(usersToAdd);
          for (const teamMember of newTeamMembers) {
            teamMember.project_id = branch.project.id;
          }
          await this.userRepo.save(newTeamMembers);
          branch.team = [...branch.team, ...newTeamMembers];
        }

        // Remove users (but ensure supervisors stay in team if they are supervisors)
        if (usersToRemove.length > 0) {
          branch.team = branch.team.filter(user => {
            // Keep if user is in usersToRemove BUT is a supervisor
            const isSupervisor = branch.supervisors?.some(s => s.id === user.id);
            if (isSupervisor) return true; 
            return !usersToRemove.includes(user.id);
          });
        }
      }
    }

    // Update other branch properties
    if (dto.cityId) branch.city = await this.cityRepo.findOneByOrFail({ id: dto.cityId });
    if (dto.chainId !== undefined) branch.chain = dto.chainId ? await this.chainRepo.findOneBy({ id: dto.chainId }) : null;
    if (dto.name) branch.name = dto.name;
    if (dto.geofence_radius_meters !== undefined) branch.geofence_radius_meters = dto.geofence_radius_meters;
    if (dto.image_url !== undefined) branch.image_url = dto.image_url;

    return this.branchRepo.save(branch);
  }

  async migrateSupervisors(): Promise<{ migrated: number }> {
    const branches = await this.branchRepo.find({
      relations: ['supervisor', 'supervisors'],
    });

    let count = 0;
    for (const branch of branches) {
      if (branch.supervisor) {
        if (!branch.supervisors) branch.supervisors = [];
        
        const alreadyExists = branch.supervisors.some(s => s.id === branch.supervisor.id);
        if (!alreadyExists) {
          branch.supervisors.push(branch.supervisor);
          await this.branchRepo.save(branch);
          count++;
        }
      }
    }
    return { migrated: count };
  }

  async fixChainConsistency(): Promise<{ fixed: number; details: string[] }> {
    const branches = await this.branchRepo.find({
      relations: ['project', 'chain', 'chain.project'],
    });

    let fixedCount = 0;
    const details: string[] = [];

    for (const branch of branches) {
      if (branch.chain && branch.project) {
        // Check for mismatch: chain has no project OR chain's project ID != branch's project ID
        const chainProject = branch.chain.project;
        const chainProjectId = chainProject ? chainProject.id : null;
        const branchProjectId = branch.project.id;

        if (chainProjectId !== branchProjectId) {
          const chainName = branch.chain.name;
          
          // Look for valid chain in the CORRECT project
          let validChain = await this.chainRepo.findOne({
            where: {
              name: chainName,
              project: { id: branchProjectId }
            }
          });

          if (!validChain) {
            // Create new chain specific to this project
            validChain = this.chainRepo.create({
              name: chainName,
              project: branch.project,
              logoUrl: branch.chain.logoUrl
            });
            await this.chainRepo.save(validChain);
            details.push(`Created chain '${chainName}' for project '${branch.project.name || branchProjectId}'`);
          }

          // Re-assign branch to the valid chain
          branch.chain = validChain;
          await this.branchRepo.save(branch);
          fixedCount++;
          details.push(`Fixed branch '${branch.name}' (ID: ${branch.id}) linked to chain '${chainName}'`);
        }
      }
    }

    return { fixed: fixedCount, details };
  }

  async findOne(id: string): Promise<Branch> {
    const branch = await this.branchRepo.findOne({ where: { id }, relations: ['project', 'city', 'chain', 'supervisor', 'supervisors', 'team'] });
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

private parseGeo(value: string | { lat: number; lng: number }): { lat: number; lng: number } {
  if (!value) return null;

  if (typeof value === 'string') {
    const parts = value.split(',').map(s => Number(s.trim()));
    if (parts.length !== 2 || parts.some(isNaN)) {
      throw new BadRequestException('Invalid geo format, expected "lat,lng"');
    }
    return { lat: parts[0], lng: parts[1] };
  }

  if (typeof value === 'object' && value.lat !== undefined && value.lng !== undefined) {
    return { lat: value.lat, lng: value.lng };
  }

  throw new BadRequestException('Invalid geo value');
}
  async importBranches(rows: any[], requester: User) {
    const result = {
      success: 0,
      failed: 0,
      errors: [],
    };

    const projectId = await this.usersService.resolveProjectIdFromUser(requester.id);
    const project = await this.projectRepo.findOne({ where: { id: projectId } });

    for (const [index, rawRow] of rows.entries()) {
      try {
        const row = this.mapHeaders(rawRow);

        const branch = await this.importSingleBranch(row, requester, project);

        // Create sales target if conditions are met
        await this.createSalesTargetForBranch(branch, row, requester);

        result.success++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          row: index + 2,
          error: err.message,
        });
      }
    }

    return result;
  }

  private async createSalesTargetForBranch(branch: Branch, row: any, requester: User) {
    // Check if autoCreateSalesTargets is enabled
    if (!branch.autoCreateSalesTargets) {
      return;
    }

    // Check if we have target data in the row
    const hasDirectTargetData = row.targetName;

    if (hasDirectTargetData) {
      await this.createSalesTargetFromRow(branch, row, requester);
    } else if (branch.defaultSalesTargetAmount >= 0) {
      // Create default sales target
      await this.createDefaultSalesTarget(branch, requester);
    }
  }

  private async createSalesTargetFromRow(branch: Branch, row: any, requester: User) {
    try {
      const salesTarget = this.salesTargetRepo.create({
        name: row.targetName || `${branch.name} - ${this.getCurrentPeriodName(branch.salesTargetType)}`,
        description: row.targetDescription || `Sales target for ${branch.name}`,
        type: branch.salesTargetType,
        status: SalesTargetStatus.ACTIVE,
        targetAmount: parseFloat(row.targetAmount) || branch.defaultSalesTargetAmount,
        currentAmount: 0,
        startDate: this.parseDate(row.targetStartDate) || this.getStartDateForPeriod(branch.salesTargetType),
        endDate: this.parseDate(row.targetEndDate) || this.getEndDateForPeriod(branch.salesTargetType),
        autoRenew: true,
        branch: branch,
        createdBy: requester,
        project: branch.project,
      });

      await this.salesTargetRepo.save(salesTarget);
      console.log(`Created sales target for branch: ${branch.name}`);
    } catch (error) {
      console.error(`Failed to create sales target for branch ${branch.name}:`, error);
      // Don't throw error here to prevent branch creation from failing
    }
  }

  private async createDefaultSalesTarget(branch: Branch, requester: User) {

        const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); 

    const startDate = new Date(currentYear, currentMonth, 1);

    const endDate = new Date(currentYear, currentMonth + 3, 0);

    // Format for display
    const startMonth = startDate.toLocaleString('default', { month: 'long' });
    const endMonth = endDate.toLocaleString('default', { month: 'long' });
    const year = currentYear;
    try {
   const salesTarget = this.salesTargetRepo.create({
      name: `${branch.name} - ${startMonth} to ${endMonth} ${year}`,
      description: `3-month sales target for ${branch.name}`,
      type: branch.salesTargetType,
      status: SalesTargetStatus.ACTIVE,
      targetAmount: branch.defaultSalesTargetAmount,
      currentAmount: 0,
      startDate: startDate,
      endDate: endDate,
      autoRenew: true,
      branch: branch,
      createdBy: requester,
    });

    await this.salesTargetRepo.save(salesTarget);
      console.log(`Created default sales target for branch: ${branch.name}`);
    } catch (error) {
      console.error(`Failed to create default sales target for branch ${branch.name}:`, error);
    }
  }

  private getCurrentPeriodName(targetType: SalesTargetType): string {
    const now = new Date();

    if (targetType === SalesTargetType.MONTHLY) {
      return now.toLocaleString('default', { month: 'long', year: 'numeric' });
    } else if (targetType === SalesTargetType.QUARTERLY) {
      const quarter = Math.floor(now.getMonth() / 3) + 1;
      return `Q${quarter} ${now.getFullYear()}`;
    }

    return now.toISOString().slice(0, 7); // Default to YYYY-MM
  }

  private getStartDateForPeriod(targetType: SalesTargetType): Date {
    const now = new Date();

    if (targetType === SalesTargetType.MONTHLY) {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (targetType === SalesTargetType.QUARTERLY) {
      const quarter = Math.floor(now.getMonth() / 3);
      return new Date(now.getFullYear(), quarter * 3, 1);
    }

    return new Date(now.getFullYear(), now.getMonth(), 1); // Default to month start
  }

  private getEndDateForPeriod(targetType: SalesTargetType): Date {
    const now = new Date();

    if (targetType === SalesTargetType.MONTHLY) {
      return new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (targetType === SalesTargetType.QUARTERLY) {
      const quarter = Math.floor(now.getMonth() / 3);
      return new Date(now.getFullYear(), (quarter + 1) * 3, 0);
    }

    return new Date(now.getFullYear(), now.getMonth() + 1, 0); // Default to month end
  }

  private parseDate(dateString: any): Date | null {
    if (!dateString) return null;

    try {
      // Try parsing as ISO string
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date;
      }

      // Try parsing as DD/MM/YYYY or MM/DD/YYYY
      const parts = dateString.toString().split(/[/\-.]/);
      if (parts.length === 3) {
        // Try different formats
        const formats = [
          new Date(parts[0], parts[1] - 1, parts[2]), // YYYY-MM-DD
          new Date(parts[2], parts[1] - 1, parts[0]), // DD-MM-YYYY
          new Date(parts[2], parts[0] - 1, parts[1]), // MM-DD-YYYY
        ];

        for (const date of formats) {
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private mapHeaders(raw: any) {
    const mapped: any = {};

    for (const key of Object.keys(raw)) {
      const normalized = normalizeHeader(key);

      // Try to find the mapped key
      let mappedKey = BRANCH_HEADER_MAP[normalized];

      // If not found, try partial matching
      if (!mappedKey) {
        for (const [pattern, value] of Object.entries(BRANCH_HEADER_MAP)) {
          if (normalized.includes(pattern) || pattern.includes(normalized)) {
            mappedKey = value;
            break;
          }
        }
      }

      if (mappedKey) {
        mapped[mappedKey] = raw[key];
        console.log(`Mapped to key: "${mappedKey}" with value: "${raw[key]}"`);
      } else {
        console.log(`No mapping found for: "${key}" (normalized: "${normalized}")`);
      }
    }

    return mapped;
  }

  private async importSingleBranch(row: any, requester: User, project: Project): Promise<Branch> {
    // Validate required fields
    if (!row.name) {
      throw new BadRequestException('Branch name is required');
    }

    if (!row.city) {
      throw new BadRequestException('City is required');
    }

    // Get or create city
    let city = await this.cityRepo.findOne({
      where: { name: row.city.trim() },
    });

    if (!city) {
      city = this.cityRepo.create({
        name: row.city.trim(),
      });
      city = await this.cityRepo.save(city);
    }

    // Get or create chain
    let chain = null;
    if (row.chain || row.retail) {
      const chainName = row.chain || row.retail;
      chain = await this.chainRepo.findOne({
        where: { name: chainName.trim() },
      });

      if (!chain) {
        chain = this.chainRepo.create({
          name: chainName.trim(),
          project: project,
        });
        chain = await this.chainRepo.save(chain);
      }
    }

    // Check if branch already exists
    const existingBranch = await this.branchRepo.findOne({
      where: {
        name: row.name.trim(),
        project: { id: project.id },
      },
    });

    if (existingBranch) {
      throw new ConflictException(`Branch "${row.name}" already exists in this project`);
    }

    // Get supervisor if provided
    let supervisor = null;
    if (row.supervisor) {
      supervisor = await this.userRepo.findOne({
        where: [
          { username: row.supervisor.trim() },
          { name: row.supervisor.trim() }
        ],
        relations: ['role', 'project'],
      });

      if (!supervisor) {
        throw new NotFoundException(`Supervisor "${row.supervisor}" not found`);
      }
    }

    // Parse coordinates
    let geo = null;
    if (row.lat && row.lng) {
      const lat = parseFloat(row.lat);
      const lng = parseFloat(row.lng);

      if (isNaN(lat) || isNaN(lng)) {
        throw new BadRequestException('Invalid latitude or longitude values');
      }

      geo = {
        lat: lat,
        lng: lng,
      };
    }

    // Parse geofence radius
    let geofenceRadius = 500;
    if (row.geofence_radius_meters) {
      const radius = parseInt(row.geofence_radius_meters);
      if (!isNaN(radius) && radius > 0) {
        geofenceRadius = radius;
      }
    }

    // Parse sales target type
    let salesTargetType = SalesTargetType.QUARTERLY;
    if (row.salesTargetType) {
      const type = row.salesTargetType.toUpperCase();
      if (Object.values(SalesTargetType).includes(type as SalesTargetType)) {
        salesTargetType = type as SalesTargetType;
      }
    }

    // Parse auto create sales targets
    let autoCreateSalesTargets = true;
    if (row.autoCreateSalesTargets !== undefined) {
      autoCreateSalesTargets = this.parseBoolean(row.autoCreateSalesTargets);
    }

    // Parse default sales target amount
    let defaultSalesTargetAmount = 0;
    if (row.defaultSalesTargetAmount) {
      const amount = parseFloat(row.defaultSalesTargetAmount);
      if (!isNaN(amount) && amount > 0) {
        defaultSalesTargetAmount = amount;
      }
    }

    // Create branch
    const branch = this.branchRepo.create({
      name: row.name.trim(),
      city: city,
      chain: chain,
      geo: geo,
      geofence_radius_meters: geofenceRadius,
      salesTargetType: salesTargetType,
      autoCreateSalesTargets: autoCreateSalesTargets,
      defaultSalesTargetAmount: defaultSalesTargetAmount,
      supervisor: supervisor,
      project: project,
    });

    return await this.branchRepo.save(branch);
  }

  private parseBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const str = value.toLowerCase().trim();
      return str === 'true' || str === 'yes' || str === '1' || str === 'y';
    }
    if (typeof value === 'number') return value === 1;
    return false;
  }


}

// constants/branch.constants.ts
export const BRANCH_HEADER_MAP = {
  // Branch info
  'branch name': 'name',
  'branchname': 'name',
  'Branch Name': 'name',
  'name': 'name',

  // Retail/Chain
  'retail': 'retail',
  'retailer': 'retail',
  'Retail': 'retail',
  'chain': 'chain',
  'store': 'chain',

  // Location
  'city': 'city',
  'City': 'city',
  'location': 'city',

  // Coordinates
  'lat': 'lat',
  'latitude': 'lat',
  'lng': 'lng',
  'longitude': 'lng',
  'lon': 'lng',

  // Geofence
  'geofence_radius_meters': 'geofence_radius_meters',
  'radius': 'geofence_radius_meters',
  'geofence': 'geofence_radius_meters',

  // Sales Target Type
  'sales_target_type': 'salesTargetType',
  'target_type': 'salesTargetType',
  'sales target type': 'salesTargetType',

  // Auto Create Targets
  'auto_create_sales_targets': 'autoCreateSalesTargets',
  'auto_targets': 'autoCreateSalesTargets',
  'auto create targets': 'autoCreateSalesTargets',

  // Default Target Amount
  'default_sales_target_amount': 'defaultSalesTargetAmount',
  'target_amount': 'defaultSalesTargetAmount',
  'sales_target': 'defaultSalesTargetAmount',
  'default target': 'defaultSalesTargetAmount',

  // Supervisor
  'supervisor': 'supervisor',
  'supervisor_name': 'supervisor',
  'manager': 'supervisor',

  // Additional Sales Target Fields (for direct import)
  'target_name': 'targetName',
  'target description': 'targetDescription',
  'sales_target_amount': 'targetAmount',
  'start_date': 'targetStartDate',
  'end_date': 'targetEndDate',
  'target_start': 'targetStartDate',
  'target_end': 'targetEndDate',
};

export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '_');
}