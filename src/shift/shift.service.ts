import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from 'entities/project.entity';
import { Shift } from 'entities/employee/shift.entity';
import { CreateShiftDto, UpdateShiftDto } from 'dto/shift.dto';

@Injectable()
export class ShiftService {
  constructor(
    @InjectRepository(Shift)
    public readonly shiftRepo: Repository<Shift>,

    @InjectRepository(Project)
    public readonly projectRepo: Repository<Project>,
  ) {}

  async create(dto: CreateShiftDto): Promise<Shift> {
    const project = await this.projectRepo.findOne({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException('Project not found');

    // ✅ التحقق من التداخل الزمني مع الشيفتات الموجودة لهذا المشروع
    const overlappingShift = await this.shiftRepo
      .createQueryBuilder('shift')
      .where('shift.project_id = :projectId', { projectId: dto.projectId })
      .andWhere(
        `
          shift.startTime < :endTime AND
          shift.endTime > :startTime
        `,
        {
          startTime: dto.startTime,
          endTime: dto.endTime,
        },
      )
      .getOne();

    if (overlappingShift) {
      throw new ConflictException(`This shift overlaps with an existing shift: [${overlappingShift.startTime} - ${overlappingShift.endTime}]`);
    }

    const shift = this.shiftRepo.create({ ...dto, project });
    return this.shiftRepo.save(shift);
  }

  async findOne(id: string): Promise<Shift> {
    const shift = await this.shiftRepo.findOne({ where: { id }, relations: ['project'] });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  async update(id: string, dto: UpdateShiftDto): Promise<Shift> {
    const shift = await this.findOne(id);

    // إذا تم تغيير التوقيت أو المشروع، تحقق من التداخل الزمني
    const newStartTime = dto.startTime ?? shift.startTime;
    const newEndTime = dto.endTime ?? shift.endTime;
    const newProjectId = dto.projectId ?? shift.project.id;

    const overlappingShift = await this.shiftRepo
      .createQueryBuilder('s')
      .where('s.project_id = :projectId', { projectId: newProjectId })
      .andWhere('s.id != :id', { id }) // تجاهل الشيفت الحالي
      .andWhere(
        `(
        (s.startTime <= :startTime AND s.endTime > :startTime) OR
        (s.startTime < :endTime AND s.endTime > :startTime) OR
        (:startTime <= s.startTime AND :endTime >= s.endTime)
      )`,
        {
          startTime: newStartTime,
          endTime: newEndTime,
        },
      )
      .getOne();

    if (overlappingShift) {
      throw new ConflictException(`This shift overlaps with an existing shift: [${overlappingShift.startTime} - ${overlappingShift.endTime}]`);
    }

    // تحديث المشروع إذا تم تغييره
    if (dto.projectId && dto.projectId !== shift.project.id) {
      const project = await this.projectRepo.findOne({ where: { id: dto.projectId } });
      if (!project) throw new NotFoundException('Project not found');
      shift.project = project;
    }

    Object.assign(shift, dto);
    return this.shiftRepo.save(shift);
  }
 
}
