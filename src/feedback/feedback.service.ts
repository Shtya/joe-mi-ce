// --- File: feedback/feedback.service.ts ---
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback } from 'entities/feedback.entity';
import { User } from 'entities/user.entity';
import { Project } from 'entities/project.entity';
import { CreateFeedbackDto, UpdateFeedbackStatusDto } from 'dto/feedback.dto';
import { CRUD } from 'common/crud.service';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    public feedbackRepo: Repository<Feedback>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
  ) {}

  async create(
    dto: CreateFeedbackDto,
    attachmentUrls: string[],
    currentUser?: User,
  ) {
    let user: User | null = null;
    if (dto.userId) {
      user = await this.userRepo.findOne({ where: { id: dto.userId } });
      if (!user) throw new NotFoundException('User not found for given userId');
    } else if (currentUser) {
      user = await this.userRepo.findOne({ where: { id: currentUser.id } });
    }

    let project: Project | null = null;
    if (dto.projectId) {
      project = await this.projectRepo.findOne({
        where: { id: dto.projectId },
      });
      if (!project)
        throw new NotFoundException('Project not found for given projectId');
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
      filters.is_resolved = is_resolved === 'true';
    }

    return CRUD.findAllRelation(
      this.feedbackRepo,
      'feedback',
      search,
      page,
      limit,
      'created_at',
      'DESC',
      ['user', 'project', 'resolvedBy'],
      ['message', 'type'], // search in message/type
      filters,
    );
  }

  async findOne(id: string) {
    const feedback = await this.feedbackRepo.findOne({
      where: { id },
      relations: ['user', 'project', 'resolvedBy'],
    });
    if (!feedback) throw new NotFoundException('Feedback not found');
    return feedback;
  }

  async resolve(id: string, dto: UpdateFeedbackStatusDto, resolver?: User) {
    const feedback = await this.feedbackRepo.findOne({ where: { id } });
    if (!feedback) throw new NotFoundException('Feedback not found');

    feedback.is_resolved = dto.is_resolved;

    if (feedback.is_resolved) {
      let resolvedBy: User | null = null;

      if (dto.resolvedById) {
        resolvedBy = await this.userRepo.findOne({
          where: { id: dto.resolvedById },
        });
        if (!resolvedBy)
          throw new NotFoundException('ResolvedBy user not found');
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
    if (!feedback) throw new NotFoundException('Feedback not found');
    await this.feedbackRepo.remove(feedback);
    return { deleted: true, id };
  }
}
