import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { CreateVacationDto, UpdateVacationDto } from 'dto/vacation.dto';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Vacation } from 'entities/employee/vacation.entity';

@Injectable()
export class VacationService {
  constructor(
    @InjectRepository(Vacation)
    public readonly vacationRepo: Repository<Vacation>,

    @InjectRepository(User)
    public readonly userRepo: Repository<User>,

    @InjectRepository(Branch)
    public readonly branchRepo: Repository<Branch>,
  ) {}

  // Create a new vacation request
  async createVacation(dto: CreateVacationDto): Promise<Vacation> {
    // Step 1: Check if the user exists
    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) {
      throw new NotFoundException(`User with id ${dto.userId} not found`);
    }

    // Step 2: Check if the branch exists
    const branch = await this.branchRepo.findOne({ where: { id: dto.branchId } });
    if (!branch) {
      throw new NotFoundException(`Branch with id ${dto.branchId} not found`);
    }

    // Step 3: Check if a vacation already exists for this user with the same start and end date
    const overlappingVacation = await this.vacationRepo.findOne({
      where: {
        user: { id: dto.userId },
        start_date: LessThanOrEqual(dto.end_date), // Overlap condition
        end_date: MoreThanOrEqual(dto.start_date), // Overlap condition
      },
    });

    if (overlappingVacation) {
      // Provide more details about the conflicting vacation
      throw new ConflictException(
        `Vacation request for user ${dto.userId} overlaps with an existing vacation request. 
        Existing vacation: Start Date: ${overlappingVacation.start_date}, End Date: ${overlappingVacation.end_date}, 
        Reason: ${overlappingVacation.reason}, Status: ${overlappingVacation.status}.`,
      );
    }

    // Step 4: Create the new vacation request
    const vacation = this.vacationRepo.create({
      ...dto,
      user,
      branch,
      status: 'pending', // Default status
    });

    // Step 5: Save the vacation and return it
    return await this.vacationRepo.save(vacation);
  }

  // Get all vacations of a user
  async getVacationsByUser(userId: string): Promise<Vacation[]> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    return await this.vacationRepo.find({ where: { user: { id: userId } } });
  }

  // Update vacation status (approved/rejected)
  async updateVacationStatus(id: string, dto: UpdateVacationDto): Promise<Vacation> {
    // Step 1: Find the vacation by ID
    const vacation = await this.vacationRepo.findOne({ where: { id }, relations: ['user'] });

    if (!vacation) {
      throw new NotFoundException(`Vacation with id ${id} not found`);
    }

    // Step 2: Validate and update the start_date and end_date if provided
    if (dto.start_date || dto.end_date) {
      vacation.start_date = dto.start_date || vacation.start_date;
      vacation.end_date = dto.end_date || vacation.end_date;
    }

    // Step 3: Update status if provided
    if (dto.status) {
      vacation.status = dto.status;
    }

    // Step 4: Set the processedBy user if provided
    if (dto.processedById) {
      const processedBy = await this.userRepo.findOne({ where: { id: dto.processedById } });
      if (!processedBy) {
        throw new NotFoundException(`User with id ${dto.processedById} not found`);
      }
      vacation.processedBy = processedBy;
    }

    // Step 5: Save and return the updated vacation
    return await this.vacationRepo.save(vacation);
  }
}
