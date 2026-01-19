import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { ERole } from 'enums/Role.enum';
import { User } from 'entities/user.entity';
import { Role } from 'entities/role.entity';
import { Project } from 'entities/project.entity';
import { Branch } from 'entities/branch.entity';
import { RegisterDto, LoginDto, UpdateUserDto } from 'dto/user.dto';
import { UsersService } from 'src/users/users.service';
import { ImportPromoterDto } from 'dto/auth.dto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
const PROMOTER_HEADER_MAP: Record<string, string> = {
  'promoter username': 'username',
  'username': 'username',
  'promoter name': 'name',
  'name': 'name',
  'mobile': 'mobile',
  'phone': 'mobile',
  'national id': 'national_id',
  'promoter picture': 'avatar_url',
  'picture': 'avatar_url',
  'avatar': 'avatar_url',
  'image': 'avatar_url',
  'user image': 'avatar_url',
  'promoter image': 'avatar_url',
  'password': 'password',
  'pass': 'password',
};
const normalizeHeader = (h: string) =>
  h.trim().toLowerCase().replace(/\s+/g, ' ');

@Injectable()
export class AuthService {
  private readonly uploadPath = './uploads/avatars';

  constructor(
    @InjectRepository(User) public userRepository: Repository<User>,
    @InjectRepository(Role) private roleRepository: Repository<Role>,
    @InjectRepository(Project) private projectRepository: Repository<Project>,
    @InjectRepository(Branch) private branchRepository: Repository<Branch>,
    private jwtService: JwtService,
    private readonly userService : UsersService
  ) {}

  async register(requester: User | null, dto: RegisterDto, file?: Express.Multer.File) {
    const existingUser = await this.userRepository.findOne({ where: { username: dto.username },withDeleted:true});
    if (existingUser) throw new BadRequestException('Username already exists');
    if(dto.mobile){
const existingUserPhone = await this.userRepository.findOne({ where: { mobile: dto.mobile },withDeleted:true });
    if (existingUserPhone) throw new BadRequestException('mobile already exists');}
    const role = await this.roleRepository.findOne({ where: { name: dto.role } });
    if (!role) throw new BadRequestException('Invalid role specified');

    if (requester) {
      if (dto.role === ERole.SUPER_ADMIN && requester.role.name !== ERole.SUPER_ADMIN) {
        throw new ForbiddenException('Only SuperAdmin can create other SuperAdmins');
      }

      if (requester.role.name === ERole.PROJECT_ADMIN) {
        if (dto.role === ERole.PROJECT_ADMIN) {
          throw new ForbiddenException('You cannot create other Project Admins');
        }
        dto.project_id = await this.userService.resolveProjectIdFromUser(requester.id);
      }
    } else {
      if (dto.role !== ERole.SUPER_ADMIN) {
        throw new ForbiddenException('Only SuperAdmin can be created this way');
      }
    }

    // Handle project
    let project: Project | null = null;
    if (dto.role === ERole.PROJECT_ADMIN && requester?.role.name === ERole.SUPER_ADMIN) {
      if (!dto.project_name) throw new BadRequestException('Project name is required when creating Project Admin');

      project = await this.projectRepository.save(
        this.projectRepository.create({
          name: dto.project_name,
          image_url: dto.image_url,
          is_active: true,
          owner: null,
        }),
      );
    } else if (dto.role !== ERole.SUPER_ADMIN) {
      const projectId = requester?.role.name === ERole.PROJECT_ADMIN ? requester.project?.id || requester.project_id: dto.project_id;
      if (!projectId) throw new BadRequestException('Project ID is required for this role');

      project = await this.projectRepository.findOne({ where: { id: projectId } });
      if (!project) throw new BadRequestException('Project not found');
    }

    // Handle branch
    let branch: Branch | null = null;
    if (dto.branch_id) {
      branch = await this.branchRepository.findOne({
        where: { id: dto.branch_id, project: { id: project.id } },
        relations: ['supervisor', 'team', 'project'],
      });
      if (!branch) throw new BadRequestException('Branch not found or not part of the project');

      // Load all branches in the same project
      const projectBranches = await this.branchRepository.find({
        where: { project: { id: project.id } },
        relations: ['supervisor', 'team'],
      });

      // Validate supervisor is not used elsewhere
      if (dto.role === ERole.SUPERVISOR) {
        if (branch.supervisor) {
          throw new ConflictException('This branch already has a supervisor assigned');
        }

        const existingSupervisor = projectBranches.find(b => b.supervisor?.username === dto.username);
        if (existingSupervisor) {
          throw new ConflictException('This supervisor is already assigned to another branch');
        }
      }

      // Validate promoter is not used elsewhere
      if (dto.role === ERole.PROMOTER) {
        const promoterUsed = projectBranches.some(b => b.team?.some(user => user.username === dto.username));
        if (promoterUsed) {
          throw new ConflictException('This promoter is already assigned to a branch in this project');
        }
      }
    }

    if (dto.role !== ERole.SUPER_ADMIN && dto.role !== ERole.PROJECT_ADMIN) {
      dto.manager_id = requester.id;
      dto.project_id = project.id;
    }

    let avatar_url = dto.image_url;
    if (file) {
      this.ensureUploadDirectory();
      const fileExtension = path.extname(file.originalname);
      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = path.join(this.uploadPath, fileName);
      
      // Move file from temp to final destination
      await fs.promises.rename(file.path, filePath);
      avatar_url = `/uploads/avatars/${fileName}`;
    }

    const user = this.userRepository.create({
      username: dto.username,
      password: await argon2.hash(dto.password),
      name: dto.name,
      project_id:project.id,
      manager_id: dto.manager_id || null,
      national_id: dto.national_id || null,
      role,
      project: dto.role === ERole.PROJECT_ADMIN ? project : undefined,

      branch: branch ?? undefined,
      is_active: true,
      created_by: requester,
      mobile: dto.mobile,
      avatar_url,
    });

    const savedUser = await this.userRepository.save(user);

    // Assign supervisor or promoter to the branch
    if (branch && dto.role === ERole.SUPERVISOR) {
      branch.supervisor = savedUser;
      await this.branchRepository.save(branch);
    }

    if (branch && dto.role === ERole.PROMOTER) {
      if (!branch.team) branch.team = [];
      branch.team.push(savedUser);
      await this.branchRepository.save(branch);
    }

    if (dto.role === ERole.PROJECT_ADMIN && requester?.role.name === ERole.SUPER_ADMIN && project) {
      project.owner = savedUser;
      await this.projectRepository.save(project);
    }

    const { password, ...result } = savedUser;
    return result;
  }

  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { username: dto.username },
      relations: ['role', 'project'],
      select: ['id', 'username', 'name', 'password', 'is_active', 'device_id', 'role', 'national_id'],
    });

    if (!user || !(await argon2.verify(user.password, dto.password))) {
      throw new ForbiddenException('Invalid username or password');
    }

    if (!user.is_active) {
      throw new ForbiddenException('Your account is inactive');
    }

    if ([ERole.PROMOTER, ERole.SUPERVISOR].includes(user.role.name as ERole)) {
      if (!dto.device_id) throw new ForbiddenException('Device ID is required for your role');

      if (!user.device_id) {
        await this.userRepository.update(user.id, { device_id: dto.device_id });
        user.device_id = dto.device_id;
      } else if (user.device_id !== dto.device_id) {
        throw new ForbiddenException('This account is registered to another device');
      }
    }

    return this.generateAuthResponse(user);
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        relations: ['role', 'project'],
      });

      if (!user || !user.is_active) {
        throw new ForbiddenException('Invalid refresh token');
      }

      return this.generateAuthResponse(user);
    } catch {
      throw new ForbiddenException('Invalid refresh token');
    }
  }

  async getCurrentUser(user: User) {
    const userWithRelations = await this.userRepository.findOne({
      where: { id: user.id },
      relations: ['role', 'project', 'branch', 'created_by'],
    });

    if (!userWithRelations) throw new NotFoundException('User not found');

    return {
      id: userWithRelations.id,
      username: userWithRelations.username,
      role: userWithRelations.role.name,
      project: userWithRelations.project,
      branch: userWithRelations.branch,
      created_by: userWithRelations.created_by,
      mobile: userWithRelations.mobile,
      is_active: userWithRelations.is_active,
    };
  }
  async getUserById(userId: string) {
    const userWithRelations = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['role', 'project', 'branch', 'created_by'],
    });

    if (!userWithRelations) throw new BadRequestException('User not found');
    const project = await this.projectRepository.findOneBy({ id: userWithRelations.project_id });

    return {
      ...userWithRelations,
      role: userWithRelations.role.name,
      role_id: userWithRelations.role.id,
			project: project,
    };
  }

  async getUsersCreatedByOrAll(requester: User) {
    const relations = ['role', 'project', 'branch', 'created_by'];
    if (requester.role.name === ERole.SUPER_ADMIN) {
      return this.userRepository.find({ relations });
    } else {
      return this.userRepository.find({
        where: { created_by: { id: requester.id } },
        relations,
      });
    }
  }

async deleteUser(userId: any, requester: User) {
  const user = await this.userRepository.findOne({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  const isSuperAdmin =
    (requester?.role?.name?.toLowerCase?.() || '') === 'super_admin';

  const requesterProjectId =
    await this.userService.resolveProjectIdFromUser(requester.id);

  const targetRoleName = user?.role?.name?.toLowerCase?.();

  if (
    targetRoleName &&
    ['admin', 'super_admin'].includes(targetRoleName) &&
    !isSuperAdmin
  ) {
    throw new ForbiddenException(
      'Only super_admin can delete admin accounts',
    );
  }

  if (requester.id === user.id) {
    throw new ForbiddenException('You cannot delete your own account');
  }

  // ✅ Same project rule
  if (!isSuperAdmin) {
    if (user.project_id && user.project_id !== requesterProjectId) {
      throw new ForbiddenException(
        'You can only delete users in your own project',
      );
    }
  }

  await this.userRepository.softDelete(user.id);
  return { success: true, deletedUserId: user.id };
}


async updateUser(userId: any, dto: UpdateUserDto, requester: User) {
  const user = await this.userRepository.findOne({
    where: { id: userId },
    withDeleted: true,
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  const isSuperAdmin =
    (requester?.role?.name?.toLowerCase?.() || '') === 'super_admin';


  // ✅ Project ownership check (same logic as delete)
  if (!isSuperAdmin) {
      const requesterProjectId =
    await this.userService.resolveProjectIdFromUser(requester.id);

    if (user.project_id && user.project_id !== requesterProjectId) {
      throw new ForbiddenException(
        'You can only update users in your own project',
      );
    }
  }

  // ✅ Optimized mobile check
  if (
    dto.mobile !== undefined &&
    dto.mobile !== user.mobile
  ) {
    const existingUser = await this.userRepository.findOne({
      where: { mobile: dto.mobile },
    });

    if (existingUser) {
      throw new ConflictException('Phone already exists');
    }
  }

  if (dto.password) {
    user.password = await argon2.hash(dto.password);
  }
  if(dto.role_id){
  this.updateUserRole(userId, dto.role_id, requester);
  }

  if(dto.username){
    const existingUser = await this.userRepository.findOne({ where: { username: dto.username } });
    if (existingUser) {
      throw new ConflictException('Username already exists');
    }
    else{
      user.username = dto.username;
    }
  }
  const { password, ...updateData } = dto;
  Object.assign(user, updateData);
  return await this.userRepository.save(user);
}


  async updateUserRole(userId: any, roleId: any, requester: User) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['project'],
    });

    if (!user) throw new NotFoundException('User not found');

    if (user.project?.id !== requester.project?.id) {
      throw new ForbiddenException('You can only update users in your own project');
    }

    const role = await this.roleRepository.findOneBy({ id: roleId as any });
    if (!role) throw new NotFoundException('Role not found');

    user.role = role;
    return this.userRepository.save(user);
  }

  private async generateAuthResponse(user: User) {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role.name,
      project_id: user.project?.id ?? user.project_id,
    };

    return {
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role.name,
        mobile: user.mobile,
        project_id: user.project?.id ?? user.project_id,
        is_active: user.is_active,
        national_id: user.national_id,
      },
      access_token: await this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn:  process.env.JWT_EXPIRE ||
        '2d',
      }),
      refresh_token: await this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn:  process.env.JWT_EXPIRE ||
        '2d',
      }),
    };
  }

  async importPromoters(rows: any[], requester: User) {
    const result = {
      success: 0,
      failed: 0,
      errors: [],
    };

    // Pre-fetch common data once
    const requesterProjectId = await this.userService.resolveProjectIdFromUser(requester.id);
    const promoterRole = await this.roleRepository.findOne({
      where: { name: ERole.PROMOTER },
    });

    for (const [index, rawRow] of rows.entries()) {
      try {
        const row = this.mapHeaders(rawRow);
        console.log(row)
        await this.importSinglePromoter(row, requester, requesterProjectId, promoterRole);
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

  async importPromotersBatch(
    rows: any[],
    requester: User,
    rowIndices: number[]
  ): Promise<{
    success: number;
    failed: number;
    errors: any[];
  }> {
    const result = {
      success: 0,
      failed: 0,
      errors: [],
    };

    // Pre-fetch common data once per batch
    const requesterProjectId = await this.userService.resolveProjectIdFromUser(requester.id);
    const promoterRole = await this.roleRepository.findOne({
      where: { name: ERole.PROMOTER },
    });

    // Process rows in parallel within the batch for maximum speed
    await Promise.all(
      rows.map(async (row, i) => {
        try {
          await this.importSinglePromoter(row, requester, requesterProjectId, promoterRole);
          result.success++;
        } catch (err) {
          result.failed++;
          result.errors.push({
            row: rowIndices[i],
            error: err.message,
          });
        }
      })
    );

    return result;
  }

  /** Map Excel/CSV headers */
  public mapHeaders(raw: any) {
    const mapped: any = {};
    for (const key of Object.keys(raw)) {
      const normalized = normalizeHeader(key);
      const mappedKey = PROMOTER_HEADER_MAP[normalized];
      if (mappedKey) {
        mapped[mappedKey] = raw[key];
      }
    }
    return mapped;
  }

  private async importSinglePromoter(
    row: any,
    requester: User,
    projectId?: string,
    role?: Role
  ) {
    if (!row.username || !row.name) {
      throw new BadRequestException('Username and name are required');
    }

    const requesterProjectId =
      projectId || (await this.userService.resolveProjectIdFromUser(requester.id));

    if (
      await this.userRepository.findOne({
        where: { username: row.username },
        withDeleted: true,
      })
    ) {
      throw new ConflictException('Username already exists');
    }

    if (row.mobile) {
      if (
        await this.userRepository.findOne({
          where: { mobile: row.mobile },
          withDeleted: true,
        })
      ) {
        row.mobile = undefined;
      }
    }

    const promoterRole =
      role ||
      (await this.roleRepository.findOne({
        where: { name: ERole.PROMOTER },
      }));

    const password = row.password?.trim() || row.username;
    const user = this.userRepository.create({
      username: row.username,
      name: row.name,
      mobile: row.mobile,
      password: await argon2.hash(password),
      role: promoterRole,
      project_id: requesterProjectId,
      manager_id: requester.id,
      is_active: true,
      avatar_url: row.avatar_url,
      created_by: requester,
    });

    if (row.avatar_url) {
      const savedAvatar = await this.downloadAndSaveImage(row.avatar_url);
      if (savedAvatar) {
        user.avatar_url = savedAvatar;
      }
    }

    return await this.userRepository.save(user);
  }

  private ensureUploadDirectory() {
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  private async downloadAndSaveImage(imageUrl: string): Promise<string> {
    if (!imageUrl || imageUrl.trim() === '' || imageUrl.toLowerCase() === 'null' || imageUrl.toLowerCase() === 'undefined') {
      return null;
    }

    try {
      this.ensureUploadDirectory();

      // Clean the URL - remove port 8080 if present
      let cleanUrl = imageUrl;
      if (imageUrl.includes(':8080')) {
        cleanUrl = imageUrl.replace(':8080', '');
      }

      // Encode spaces in URL
      cleanUrl = cleanUrl.replace(/ /g, '%20');

      const response = await axios({
        method: 'GET',
        url: cleanUrl,
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.data || response.data.length === 0) {
        return null;
      }

      let fileExtension = '.png';
      const contentType = response.headers['content-type'];
      if (contentType) {
        if (contentType.includes('jpeg') || contentType.includes('jpg')) {
          fileExtension = '.jpg';
        } else if (contentType.includes('png')) {
          fileExtension = '.png';
        } else if (contentType.includes('gif')) {
          fileExtension = '.gif';
        } else if (contentType.includes('webp')) {
          fileExtension = '.webp';
        }
      }

      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = path.join(this.uploadPath, fileName);

      await fs.promises.writeFile(filePath, response.data);

      return `/uploads/avatars/${fileName}`;

    } catch (error) {
      console.error(`Error downloading avatar from ${imageUrl}:`, error.message);
      return null;
    }
  }
}