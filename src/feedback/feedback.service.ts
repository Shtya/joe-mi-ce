// --- File: feedback/feedback.service.ts ---
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { join } from "path";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Feedback } from "entities/feedback.entity";
import { User } from "entities/user.entity";
import { Project } from "entities/project.entity";
import { Journey } from "entities/all_plans.entity";
import { CreateFeedbackDto, UpdateFeedbackStatusDto } from "dto/feedback.dto";
import { CRUD } from "common/crud.service";
import { UsersService } from "src/users/users.service";
import { buildFeedbackWorkbook } from "./feedback-export";

export interface FeedbackExportFilters {
  projectId: string;
  search?: string;
  userId?: string;
  type?: string;
  is_resolved?: string;
  start_date?: string;
  end_date?: string;
  created_at?: string;
  publicBaseUrl?: string;
}

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    public feedbackRepo: Repository<Feedback>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,

    private readonly usersService: UsersService,
  ) {}

  async create(
    dto: CreateFeedbackDto,
    attachmentUrls: string[],
    currentUser?: User,
  ) {
    let user: User | null = null;
    if (dto.userId) {
      user = await this.userRepo.findOne({ where: { id: dto.userId } });
      if (!user) throw new NotFoundException("User not found for given userId");
    } else if (currentUser) {
      user = await this.userRepo.findOne({ where: { id: currentUser.id } });
    }

    if (!user) {
      throw new NotFoundException("User not found for feedback submission");
    }

    // Use the same project resolution as listing, including owners and branches.
    const projectId = await this.usersService.resolveProjectIdFromUser(user.id);
    if (dto.projectId && dto.projectId !== projectId) {
      throw new ForbiddenException(
        "Feedback project must match the user's project",
      );
    }
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException("Project not found for feedback submission");
    }

    const feedback = this.feedbackRepo.create({
      user,
      project,
      type: dto.type,
      message: dto.message,
      attachment_urls: attachmentUrls.length ? attachmentUrls : null,
      is_resolved: false,
      resolvedBy: null,
      resolved_at: null,
    });

    return this.feedbackRepo.save(feedback);
  }

  async findAll(params: {
    page?: number | string;
    limit?: number | string;
    search?: string;
    projectId?: string;
    userId?: string;
    type?: string;
    is_resolved?: string;
  }) {
    const {
      page = 1,
      limit = 10,
      search,
      projectId,
      userId,
      type,
      is_resolved,
    } = params;

    const filters: any = {};

    if (projectId) filters.project = { id: projectId };
    if (userId) filters.user = { id: userId };
    if (type) filters.type = type;
    if (is_resolved !== undefined) {
      // comes as string from query (?is_resolved=true/false)
      filters.is_resolved = is_resolved === "true";
    }

    return CRUD.findAllRelation(
      this.feedbackRepo,
      "feedback",
      search,
      page,
      limit,
      "created_at",
      "DESC",
      ["user", "project", "resolvedBy"],
      ["message", "type"], // search in message/type
      filters,
    );
  }

  async findOne(id: string) {
    const feedback = await this.feedbackRepo.findOne({
      where: { id },
      relations: ["user", "project", "resolvedBy"],
    });
    if (!feedback) throw new NotFoundException("Feedback not found");
    return feedback;
  }

  async exportToExcel(filters: FeedbackExportFilters) {
    const query = this.feedbackRepo
      .createQueryBuilder("feedback")
      .leftJoinAndSelect("feedback.user", "user")
      .leftJoinAndSelect("user.branch", "userBranch")
      .leftJoinAndSelect("feedback.project", "project")
      .leftJoinAndSelect("feedback.resolvedBy", "resolvedBy")
      .where("project.id = :projectId", { projectId: filters.projectId })
      .orderBy("feedback.created_at", "DESC");

    if (filters.userId) {
      query.andWhere("user.id = :userId", { userId: filters.userId });
    }
    if (filters.type) {
      query.andWhere("feedback.type = :type", { type: filters.type });
    }
    if (filters.is_resolved === "true" || filters.is_resolved === "false") {
      query.andWhere("feedback.is_resolved = :isResolved", {
        isResolved: filters.is_resolved === "true",
      });
    }
    if (filters.start_date) {
      query.andWhere("DATE(feedback.created_at) >= :startDate", {
        startDate: filters.start_date,
      });
    }
    if (filters.end_date) {
      query.andWhere("DATE(feedback.created_at) <= :endDate", {
        endDate: filters.end_date,
      });
    }
    if (filters.created_at) {
      query.andWhere("DATE(feedback.created_at) = :createdAt", {
        createdAt: filters.created_at,
      });
    }
    if (filters.search?.trim()) {
      query.andWhere(
        `(LOWER(feedback.message) LIKE LOWER(:search)
          OR LOWER(feedback.type) LIKE LOWER(:search)
          OR LOWER(user.name) LIKE LOWER(:search)
          OR LOWER(user.username) LIKE LOWER(:search)
          OR LOWER(project.name) LIKE LOWER(:search))`,
        { search: `%${filters.search.trim()}%` },
      );
    }

    const feedbacks = await query.getMany();
    const branchByUserId = new Map<string, string>();
    const userIds = [
      ...new Set(
        feedbacks
          .map((feedback) => feedback.user?.id)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    ];

    await Promise.all(
      userIds.map(async (userId) => {
        const lastCheckedInJourney = await this.feedbackRepo.manager
          .createQueryBuilder(Journey, "journey")
          .innerJoin("journey.checkin", "checkin")
          .leftJoinAndSelect("journey.branch", "branch")
          .where("journey.user.id = :userId", { userId })
          .andWhere("checkin.checkInTime IS NOT NULL")
          .orderBy("checkin.checkInTime", "DESC")
          .addOrderBy("journey.date", "DESC")
          .addOrderBy("journey.created_at", "DESC")
          .getOne();

        const assignedBranch = feedbacks.find(
          (feedback) => feedback.user?.id === userId,
        )?.user?.branch;
        branchByUserId.set(
          userId,
          lastCheckedInJourney?.branch?.name ?? assignedBranch?.name ?? "",
        );
      }),
    );

    const exportRows = feedbacks.map((feedback) => ({
      ...feedback,
      exportBranchName: feedback.user?.id
        ? (branchByUserId.get(feedback.user.id) ?? "")
        : "",
    }));

    return buildFeedbackWorkbook(
      exportRows,
      join(process.cwd(), "uploads", "feedback"),
      filters.publicBaseUrl,
    );
  }

  async resolve(id: string, dto: UpdateFeedbackStatusDto, resolver?: User) {
    const feedback = await this.feedbackRepo.findOne({ where: { id } });
    if (!feedback) throw new NotFoundException("Feedback not found");

    feedback.is_resolved = dto.is_resolved;

    if (feedback.is_resolved) {
      let resolvedBy: User | null = null;

      if (dto.resolvedById) {
        resolvedBy = await this.userRepo.findOne({
          where: { id: dto.resolvedById },
        });
        if (!resolvedBy) {
          throw new NotFoundException("ResolvedBy user not found");
        }
      } else if (resolver) {
        resolvedBy = await this.userRepo.findOne({
          where: { id: resolver.id },
        });
      }

      feedback.resolvedBy = resolvedBy;
      feedback.resolved_at = new Date();
    } else {
      feedback.resolvedBy = null;
      feedback.resolved_at = null;
    }

    return this.feedbackRepo.save(feedback);
  }

  async remove(id: string) {
    const feedback = await this.feedbackRepo.findOne({ where: { id } });
    if (!feedback) throw new NotFoundException("Feedback not found");
    await this.feedbackRepo.remove(feedback);
    return { deleted: true, id };
  }
}
