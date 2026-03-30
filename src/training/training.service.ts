import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Training } from "../../entities/training.entity";
import { CreateTrainingDto, UpdateTrainingDto } from "../../dto/training.dto";

@Injectable()
export class TrainingService {
  constructor(
    @InjectRepository(Training)
    private readonly trainingRepo: Repository<Training>,
  ) {}

  async getByProject(projectId: string): Promise<Training[]> {
    return await this.trainingRepo.find({
      where: { projectId },
      order: { created_at: "DESC" },
    });
  }

  async findOne(id: string): Promise<Training> {
    const training = await this.trainingRepo.findOne({ where: { id } });
    if (!training) {
      throw new NotFoundException(`Training material with ID ${id} not found`);
    }
    return training;
  }

  async create(
    projectId: string,
    dto: CreateTrainingDto,
    filename?: string,
  ): Promise<Training> {
    const training = this.trainingRepo.create({
      ...dto,
      projectId,
      ...(filename && { pdf_url: `/uploads/training/${filename}` }),
    });
    return await this.trainingRepo.save(training);
  }

  async update(
    id: string,
    dto: UpdateTrainingDto,
    filename?: string,
  ): Promise<Training> {
    const training = await this.findOne(id);
    Object.assign(training, dto);
    if (filename) {
      training.pdf_url = `/uploads/training/${filename}`;
    }
    return await this.trainingRepo.save(training);
  }

  async delete(id: string): Promise<{ success: boolean }> {
    const training = await this.findOne(id);
    await this.trainingRepo.softRemove(training);
    return { success: true };
  }

  async findAll() {
    return await this.trainingRepo.find();
  }
}
