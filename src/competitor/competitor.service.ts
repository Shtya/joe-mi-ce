import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Competitor } from 'entities/competitor.entity';
import { CreateCompetitorDto, UpdateCompetitorDto } from 'dto/competitors.dto';
import { Project } from 'entities/project.entity';

@Injectable()
export class CompetitorService {
  constructor(
    @InjectRepository(Competitor)
    public readonly competitorRepo: Repository<Competitor>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
  ) {}

  async createCompetitor(dto: CreateCompetitorDto): Promise<Competitor> {
    const project = await this.projectRepo.findOne({ where: { id: dto.projectId } });
    if (!project) {
      throw new NotFoundException(`Project with id ${dto.projectId} not found`);
    }

    const existingCompetitor = await this.competitorRepo.findOne({
      where: { name: dto.name, project: { id: dto.projectId } },
    });
    if (existingCompetitor) {
      throw new ConflictException(`Competitor with name ${dto.name} already exists for this project`);
    }

    const competitor = this.competitorRepo.create({
      ...dto,
      project,
    });

    return await this.competitorRepo.save(competitor);
  }

  async getCompetitorById(id: any) {
    const competitor = await this.competitorRepo.findOne(id);
    if (!competitor) {
      throw new NotFoundException(`Competitor with id ${id} not found`);
    }
    return competitor;
  }

  async updateCompetitor(id: string, dto: UpdateCompetitorDto): Promise<Competitor> {
    const competitor = await this.competitorRepo.findOne({
      where: { id },
      relations: ['project'],
    });

    if (!competitor) {
      throw new NotFoundException(`Competitor with id ${id} not found`);
    }

    if (dto.projectId) {
      const project = await this.projectRepo.findOne({ where: { id: dto.projectId } });
      if (!project) {
        throw new NotFoundException(`Project with id ${dto.projectId} not found`);
      }
      competitor.project = project;
    }

    if (dto.name && dto.name !== competitor.name) {
      const existingCompetitor = await this.competitorRepo.findOne({
        where: { name: dto.name, project: { id: competitor.project.id } },
      });
      if (existingCompetitor) {
        throw new ConflictException(`Competitor with name ${dto.name} already exists for this project`);
      }
      competitor.name = dto.name;
    }

    Object.assign(competitor, dto);

    return await this.competitorRepo.save(competitor);
  }

  async deleteCompetitor(id: string): Promise<void> {
    const competitor = await this.getCompetitorById(id);
    await this.competitorRepo.remove(competitor);
  }
}
