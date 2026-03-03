import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Training } from '../../entities/training.entity';
import { CreateTrainingDto, UpdateTrainingDto } from '../../dto/training.dto';

@Injectable()
export class TrainingService {
  constructor(
    @InjectRepository(Training)
    private readonly trainingRepo: Repository<Training>,
  ) {}

  async getByProject(projectId: string) {
    const training = await this.trainingRepo.findOne({
      where: { projectId },
    });
    if (!training) {
      throw new NotFoundException('Training material not found for this project');
    }
    return training;
  }

  async createOrUpdate(dto: CreateTrainingDto) {
    let training = await this.trainingRepo.findOne({
      where: { projectId: dto.projectId },
    });

    if (training) {
      Object.assign(training, dto);
    } else {
      training = this.trainingRepo.create(dto);
    }

    return await this.trainingRepo.save(training);
  }

  async savePdf(projectId: string, filename: string) {
    const training = await this.trainingRepo.findOne({
      where: { projectId },
    });

    if (!training) {
      throw new NotFoundException('Training record not found. Please create it first.');
    }

    training.pdf_url = `/uploads/training/${filename}`;
    return await this.trainingRepo.save(training);
  }

  async findAll() {
      return await this.trainingRepo.find();
  }
}
