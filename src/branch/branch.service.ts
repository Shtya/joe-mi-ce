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

@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch) readonly branchRepo: Repository<Branch>,
    @InjectRepository(Project) readonly projectRepo: Repository<Project>,
    @InjectRepository(City) readonly cityRepo: Repository<City>,
    @InjectRepository(Chain) readonly chainRepo: Repository<Chain>,
    @InjectRepository(User) readonly userRepo: Repository<User>,
    @InjectRepository(SalesTarget) readonly salesTargetRepo: Repository<SalesTarget>,

  ) {}
  async create(dto: CreateBranchDto, user: User): Promise<Branch> {
    console.log(user.role.name, ERole.PROJECT_ADMIN);
    if (user.role?.name !== ERole.PROJECT_ADMIN) {
      throw new ForbiddenException('Only the admin can create branches');
    }

    const project = await this.projectRepo.findOne({
      where: { id: user.project.id },
      relations: ['owner'],
    });
    if (!project) throw new NotFoundException('Project not found');

    const existingBranch = await this.branchRepo.findOne({
      where: { name: dto.name, project: { id: user.project.id } },
    });
    if (existingBranch) throw new ConflictException('Branch name must be unique within the project');

    const city = await this.cityRepo.findOneByOrFail({ id: dto.cityId });
    const chain = dto.chainId ? await this.chainRepo.findOneBy({ id: dto.chainId }) : null;

    const projectBranches = await this.branchRepo.find({
      where: { project: { id: project.id } },
      relations: ['supervisor', 'team'],
    });

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

    const branch = this.branchRepo.create({
      name: dto.name,
      geo: dto.geo,
      geofence_radius_meters: dto.geofence_radius_meters ?? 500,
      image_url: dto.image_url,
      project,
      city,
      chain,
      supervisor,
      team,
      salesTargetType: dto.salesTargetType ?? SalesTargetType.QUARTERLY,
      autoCreateSalesTargets: dto.autoCreateSalesTargets ?? true,
      defaultSalesTargetAmount: dto.defaultSalesTargetAmount ?? null
    });
    const savedBranch = await this.branchRepo.save(branch);
    if (savedBranch.autoCreateSalesTargets && savedBranch.defaultSalesTargetAmount) {
      const salesTarget = this.salesTargetRepo.create({
        branch: savedBranch,
        type: savedBranch.salesTargetType,
        name:`default target ${dto.name}`,
        description: `this is the deafault target of the branch ${dto.name} and the target is ${dto.defaultSalesTargetAmount}`,

        targetAmount: savedBranch.defaultSalesTargetAmount,
        autoRenew:savedBranch.autoCreateSalesTargets,


      });
    
      await this.salesTargetRepo.save(salesTarget);
    }
    
    return savedBranch;

  }

  async assignSupervisor(branchId: string, userId: string, user: User): Promise<Branch> {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId },
      relations: ['project', 'project.owner', 'supervisor'],
    });

    if (!branch) throw new NotFoundException('Branch not found');
    if (branch.supervisor) {
      throw new ConflictException('This branch already has a supervisor assigned');
    }

    const supervisor = await this.userRepo.findOneByOrFail({ id: userId });
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
      relations: ['team'],
    });

    const isAlreadyAssignedElsewhere = projectBranches.some(b => b.id !== branch.id && b.team.some(user => user.id === promoter.id));

    if (isAlreadyAssignedElsewhere) {
      throw new ConflictException('This user is already assigned as a promoter in another branch of the project');
    }

    // ✅ Add promoter
    branch.team.push(promoter);
    await this.branchRepo.save(branch);

    return { message: 'Promoter assigned successfully' };
  }

  async update(id: string, dto: UpdateBranchDto, user: User): Promise<Branch> {
    const branch = await this.branchRepo.findOne({ where: { id }, relations: ['project', 'project.owner'] });
    if (!branch) throw new NotFoundException('Branch not found');
    if (branch.project.owner.id !== user.id) throw new ForbiddenException('Access denied');

    if (dto.cityId) branch.city = await this.cityRepo.findOneByOrFail({ id: dto.cityId });
    if (dto.chainId !== undefined) branch.chain = dto.chainId ? await this.chainRepo.findOneBy({ id: dto.chainId }) : null;
    if (dto.name) branch.name = dto.name;
    if (dto.geo) branch.geo = dto.geo;
    if (dto.geofence_radius_meters !== undefined) branch.geofence_radius_meters = dto.geofence_radius_meters;
    if (dto.image_url !== undefined) branch.image_url = dto.image_url;

    return this.branchRepo.save(branch);
  }

  async findOne(id: string): Promise<Branch> {
    const branch = await this.branchRepo.findOne({ where: { id }, relations: ['project', 'city', 'chain', 'supervisor', 'team'] });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async remove(id: string, user: User) {
    const branch = await this.branchRepo.findOne({ where: { id }, relations: ['project', 'project.owner'] });
    if (!branch) throw new NotFoundException('Branch not found');
    if (branch.project.owner.id !== user.id) throw new ForbiddenException('Access denied');
    await this.branchRepo.softRemove(branch);
  }
}
