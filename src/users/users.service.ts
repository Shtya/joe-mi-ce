// services/users.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, Repository } from "typeorm";
import { User } from "entities/user.entity";
import { Branch } from "entities/branch.entity";
import { Project } from "entities/project.entity";
import { Brand } from "entities/products/brand.entity";
import { CheckIn, Journey, JourneyPlan } from "entities/all_plans.entity";
import { BrandAssignmentMode } from "enums/BrandAssignmentMode.enum";
import { ERole } from "enums/Role.enum";
import {
  UserResponseDto,
  UsersByBranchResponseDto,
  ProjectUsersResponseDto,
} from "dto/users.dto";

export interface BrandAccessScope {
  isSuper: boolean;
  projectId?: string;
  mode: BrandAssignmentMode;
  brandIds?: string[];
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly dataSource: DataSource,
  ) {}

  private get brandRepository(): Repository<Brand> {
    return this.dataSource.getRepository(Brand);
  }

  async getUserProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ["role", "branch", "project", "assignedBrands"],
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.mapUserToDto(user);
  }
  async resolveUserWithProject(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ["project", "branch", "branch.project", "role"],
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }
  async getUserById(
    userId: string,
    projectId: string,
  ): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: {
        id: userId,
        project_id: projectId,
      },
      relations: ["role", "branch", "assignedBrands"],
    });

    if (!user) {
      throw new NotFoundException("User not found in this project");
    }

    return this.mapUserToDto(user);
  }

  async getProjectUsers(projectId: string): Promise<ProjectUsersResponseDto> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ["branches"],
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    const branchesWithUsers = await this.getUsersByBranches(projectId);
    const totalUsers = branchesWithUsers.reduce(
      (total, branch) => total + branch.users.length,
      0,
    );

    return {
      projectId: project.id,
      projectName: project.name,
      branches: branchesWithUsers,
      totalUsers,
    };
  }

  async getUsersByBranches(
    projectId: string,
  ): Promise<UsersByBranchResponseDto[]> {
    const branches = await this.branchRepository.find({
      where: { project: { id: projectId } },
      relations: ["team", "team.role", "team.assignedBrands"],
    });

    return branches.map((branch) => ({
      branchId: branch.id,
      branchName: branch.name,
      users: branch.team.map((user) => this.mapUserToDto(user)),
    }));
  }

  async getUsersByBranch(
    branchId: string,
    projectId: string,
  ): Promise<UsersByBranchResponseDto> {
    const branch = await this.branchRepository.findOne({
      where: {
        id: branchId,
        project: { id: projectId },
      },
      relations: ["team", "team.role", "team.assignedBrands"],
    });

    if (!branch) {
      throw new NotFoundException("Branch not found in this project");
    }

    return {
      branchId: branch.id,
      branchName: branch.name,
      users: branch.team.map((user) => this.mapUserToDto(user)),
    };
  }

  async getUsersInProject(projectId: string): Promise<UserResponseDto[]> {
    const users = await this.userRepository.find({
      where: { project_id: projectId },
      relations: ["role", "branch", "assignedBrands"],
    });

    return users.map((user) => this.mapUserToDto(user));
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
      brandAssignmentMode: user.brandAssignmentMode || BrandAssignmentMode.ALL,
      assignedBrands: (user.assignedBrands || []).map((brand) => ({
        id: brand.id,
        name: brand.name,
      })),
      national_id: user.national_id,
      account_name: user.account_name,
      iban: user.iban,
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
          name: In(["promoter", "supervisor"]),
        },
      },
      relations: ["role", "branch", "assignedBrands"],
    });

    return users.map((user) => this.mapUserToDto(user));
  }

  async resolveProjectIdFromUser(userId: string): Promise<string> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ["branch", "branch.project", "project"],
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Priority:
    // 1️⃣ Direct project on user
    if (user.project) {
      return user.project?.id;
    }
    if (user.project_id) {
      return user.project_id;
    }
    // 2️⃣ Project via branch
    if (user.branch?.project) {
      return user.branch.project.id;
    }

    throw new ForbiddenException("User is not assigned to any project");
  }

  async validateBrandAssignment(
    projectId: string | null | undefined,
    mode: BrandAssignmentMode = BrandAssignmentMode.ALL,
    brandIds: string[] = [],
  ): Promise<Brand[]> {
    const normalizedMode = mode || BrandAssignmentMode.ALL;

    if (normalizedMode === BrandAssignmentMode.ALL) {
      return [];
    }

    if (!projectId) {
      throw new BadRequestException("Project ID is required for brand assignment");
    }

    const uniqueBrandIds = [...new Set(brandIds || [])];
    if (uniqueBrandIds.length === 0) {
      throw new BadRequestException(
        "brandIds is required when brandAssignmentMode is custom",
      );
    }

    const brands = await this.brandRepository.find({
      where: {
        id: In(uniqueBrandIds),
        project_id: projectId,
      },
    });

    if (brands.length !== uniqueBrandIds.length) {
      throw new BadRequestException(
        "All assigned brands must belong to the user's project",
      );
    }

    return brands;
  }

  async applyBrandAssignment(
    user: User,
    projectId: string | null | undefined,
    mode: BrandAssignmentMode = BrandAssignmentMode.ALL,
    brandIds: string[] = [],
  ): Promise<User> {
    const normalizedMode = mode || BrandAssignmentMode.ALL;
    user.brandAssignmentMode = normalizedMode;
    user.assignedBrands =
      normalizedMode === BrandAssignmentMode.CUSTOM
        ? await this.validateBrandAssignment(projectId, normalizedMode, brandIds)
        : [];
    return user;
  }

  async resolveBrandAccessScope(userOrId: User | string): Promise<BrandAccessScope> {
    if (!userOrId) {
      throw new UnauthorizedException("Authenticated user is required");
    }

    const userId = typeof userOrId === "string" ? userOrId : userOrId.id;
    if (!userId) {
      throw new UnauthorizedException("Authenticated user is required");
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ["role", "project", "branch", "branch.project", "assignedBrands"],
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const roleName = user.role?.name;
    const isSuper = roleName === ERole.SUPER_ADMIN;
    const mode = user.brandAssignmentMode || BrandAssignmentMode.ALL;

    if (isSuper) {
      return { isSuper: true, mode };
    }

    const projectId = await this.resolveProjectIdFromUser(user.id);

    if (mode === BrandAssignmentMode.CUSTOM) {
      return {
        isSuper: false,
        projectId,
        mode,
        brandIds: (user.assignedBrands || []).map((brand) => brand.id),
      };
    }

    return {
      isSuper: false,
      projectId,
      mode: BrandAssignmentMode.ALL,
    };
  }

  applyBrandScopeToBrandQuery(qb: any, alias: string, scope: BrandAccessScope) {
    if (scope.isSuper) return;

    qb.andWhere(`${alias}.project_id = :brandScopeProjectId`, {
      brandScopeProjectId: scope.projectId,
    });

    if (scope.mode === BrandAssignmentMode.CUSTOM) {
      if (!scope.brandIds?.length) {
        qb.andWhere("1 = 0");
        return;
      }
      qb.andWhere(`${alias}.id IN (:...brandScopeBrandIds)`, {
        brandScopeBrandIds: scope.brandIds,
      });
    }
  }

  applyBrandScopeToProductQuery(qb: any, productAlias: string, scope: BrandAccessScope) {
    if (scope.isSuper) return;

    qb.andWhere(`${productAlias}.project_id = :productScopeProjectId`, {
      productScopeProjectId: scope.projectId,
    });

    if (scope.mode === BrandAssignmentMode.CUSTOM) {
      if (!scope.brandIds?.length) {
        qb.andWhere("1 = 0");
        return;
      }
      qb.andWhere(`${productAlias}.brand_id IN (:...productScopeBrandIds)`, {
        productScopeBrandIds: scope.brandIds,
      });
    }
  }

  canAccessBrand(scope: BrandAccessScope, brandId?: string | null): boolean {
    if (scope.isSuper || scope.mode === BrandAssignmentMode.ALL) return true;
    return !!brandId && !!scope.brandIds?.includes(brandId);
  }
  async registerFcmToken(
    userId: string,
    token: string,
  ): Promise<{ success: boolean }> {
    await this.userRepository.update({ id: userId }, { fcm_token: token });
    return { success: true };
  }

  async deleteUser(
    userId: string,
    lang: "ar" | "en" = "en",
  ): Promise<{ success: boolean; code: number; message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException(
        lang === "ar" ? "المستخدم غير موجود" : "User not found",
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await this.softDeleteEmployeeJourneyData(user.id, manager);
      await manager.getRepository(User).softRemove(user);
    });

    return {
      success: true,
      code: 200,
      message:
        lang === "ar" ? "تم حذف المستخدم بنجاح" : "User deleted successfully",
    };
  }

  async removeEmployeeJourneys(userId: string): Promise<{
    checkIns: number;
    journeys: number;
    journeyPlans: number;
  }> {
    return this.dataSource.transaction((manager) =>
      this.softDeleteEmployeeJourneyData(userId, manager),
    );
  }

  private async softDeleteEmployeeJourneyData(
    userId: string,
    manager: EntityManager,
  ): Promise<{ checkIns: number; journeys: number; journeyPlans: number }> {
    const checkInsResult = await manager
      .getRepository(CheckIn)
      .createQueryBuilder()
      .softDelete()
      .where('"userId" = :userId', { userId })
      .execute();

    const journeysResult = await manager
      .getRepository(Journey)
      .createQueryBuilder()
      .softDelete()
      .where('"userId" = :userId', { userId })
      .execute();

    const journeyPlansResult = await manager
      .getRepository(JourneyPlan)
      .createQueryBuilder()
      .softDelete()
      .where('"userId" = :userId', { userId })
      .execute();

    return {
      checkIns: checkInsResult.affected || 0,
      journeys: journeysResult.affected || 0,
      journeyPlans: journeyPlansResult.affected || 0,
    };
  }

  async importUsersData(
    rows: any[],
  ): Promise<{ success: boolean; updatedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let updatedCount = 0;

    for (const row of rows) {
      const username = row["User"] || row["username"] || row["username "];
      const nationalId = row["ID"] || row["national_id"] || row["national_id "];
      const mobileNumber = row["Phone"] || row["mobile"] || row["mobile "];

      if (!username) {
        errors.push(`Row missing username: ${JSON.stringify(row)}`);
        continue;
      }

      const updateData: any = {};
      if (nationalId) {
        updateData.national_id = nationalId.toString().trim();
      }
      if (mobileNumber) {
        updateData.mobile = mobileNumber.toString().trim();
      }

      if (Object.keys(updateData).length === 0) {
        errors.push(
          `Row for user ${username} missing both national ID and mobile number`,
        );
        continue;
      }

      const user = await this.userRepository.findOne({
        where: { username: username.toString().trim() },
      });

      if (!user) {
        errors.push(`User ${username} not found`);
        continue;
      }

      await this.userRepository.update({ id: user.id }, updateData);
      updatedCount++;
    }

    return {
      success: true,
      updatedCount,
      errors,
    };
  }

  async makeUserInactive(userId: string): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    
    await this.userRepository.update({ id: userId }, { is_active: false });
    return { success: true, message: 'User is now inactive' };
  }

  async toggleUserActive(userId: string): Promise<{ success: boolean; message: string; is_active: boolean }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    
    const newStatus = !user.is_active;
    await this.userRepository.update({ id: userId }, { is_active: newStatus });
    return { 
      success: true, 
      message: newStatus ? 'User is now active' : 'User is now inactive',
      is_active: newStatus 
    };
  }

  async removeUserFromBranch(userId: string): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    
    await this.userRepository.update({ id: userId }, { branch: null });
    return { success: true, message: 'User removed from branch' };
  }
}
