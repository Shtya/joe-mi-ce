import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  EntranceLetter,
  EEntranceLetterStatus,
} from "../../entities/entrance-letter.entity";
import { CreateEntranceLetterDto } from "../../dto/entrance-letter/create-entrance-letter.dto";
import { UpdateEntranceLetterStatusDto } from "../../dto/entrance-letter/update-entrance-letter-status.dto";
import { User } from "../../entities/user.entity";
import { Project } from "../../entities/project.entity";
import { Branch } from "../../entities/branch.entity";
import { ERole } from "../../enums/Role.enum";

@Injectable()
export class EntranceLetterService {
  constructor(
    @InjectRepository(EntranceLetter)
    private readonly entranceLetterRepo: Repository<EntranceLetter>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
  ) {}

  async create(supervisorId: string, dto: CreateEntranceLetterDto) {
    try {
      const supervisor = await this.userRepo.findOne({
        where: { id: supervisorId },
      });
      if (!supervisor) throw new NotFoundException("Supervisor not found");

      const promoter = await this.userRepo.findOne({
        where: { id: dto.promoterId },
      });
      if (!promoter) throw new NotFoundException("Promoter not found");

      const project = await this.projectRepo.findOne({
        where: { id: dto.projectId },
      });
      if (!project) throw new NotFoundException("Project not found");

      const branch = await this.branchRepo.findOne({
        where: { id: dto.branchId },
      });
      if (!branch) throw new NotFoundException("Branch not found");

      const entranceLetter = this.entranceLetterRepo.create({
        supervisor,
        promoter,
        project,
        branch,
        status: EEntranceLetterStatus.PENDING,
      });

      return await this.entranceLetterRepo.save(entranceLetter);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        "Failed to create entrance letter request",
      );
    }
  }

  async findAll(user: any, status?: EEntranceLetterStatus) {
    const query = this.entranceLetterRepo
      .createQueryBuilder("letter")
      .leftJoinAndSelect("letter.supervisor", "supervisor")
      .leftJoinAndSelect("letter.promoter", "promoter")
      .leftJoinAndSelect("letter.project", "project")
      .leftJoinAndSelect("letter.branch", "branch")
      .leftJoinAndSelect("letter.processedBy", "processedBy");

    if (user.role === ERole.SUPERVISOR) {
      query.andWhere("letter.supervisor_id = :supervisorId", {
        supervisorId: user.id,
      });
    }

    if (status) {
      query.andWhere("letter.status = :status", { status });
    }

    const letters = await query.getMany();
    return letters.map((letter) => this.mapToResponse(letter));
  }

  async findOne(id: string) {
    const letter = await this.entranceLetterRepo.findOne({
      where: { id },
      relations: [
        "supervisor",
        "promoter",
        "project",
        "branch",
        "processedBy",
        "branch.city",
      ],
    });
    if (!letter) {
      throw new NotFoundException("Entrance letter request not found");
    }
    return this.mapToResponse(letter);
  }

  async updateStatus(
    id: string,
    adminId: string,
    dto: UpdateEntranceLetterStatusDto,
  ) {
    try {
      const letter = await this.entranceLetterRepo.findOne({
        where: { id },
        relations: [
          "supervisor",
          "promoter",
          "project",
          "branch",
          "processedBy",
        ],
      });
      if (!letter) {
        throw new NotFoundException("Entrance letter request not found");
      }

      const admin = await this.userRepo.findOne({ where: { id: adminId } });
      if (!admin) throw new NotFoundException("Admin not found");

      letter.status = dto.status;
      letter.processedBy = admin;
      letter.rejection_reason = dto.rejectionReason;

      const saved = await this.entranceLetterRepo.save(letter);
      return this.findOne(saved.id);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        "Failed to update entrance letter status",
      );
    }
  }

  private mapToResponse(letter: EntranceLetter) {
    return {
      id: letter.id,
      status: letter.status,
      rejectionReason: letter.rejection_reason,
      createdAt: letter.created_at,
      updatedAt: letter.updated_at,
      supervisor: {
        id: letter.supervisor?.id,
        name: letter.supervisor?.name,
        username: letter.supervisor?.username,
      },
      promoter: {
        id: letter.promoter?.id,
        name: letter.promoter?.name,
        username: letter.promoter?.username,
      },
      project: {
        id: letter.project?.id,
        name: letter.project?.name,
      },
      branch: {
        id: letter.branch?.id,
        name: letter.branch?.name,
        city: letter.branch?.city?.name,
      },
      processedBy: letter.processedBy
        ? {
            id: letter.processedBy.id,
            name: letter.processedBy.name,
          }
        : null,
    };
  }
}
