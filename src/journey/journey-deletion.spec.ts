import { Test, TestingModule } from '@nestjs/testing';
import { JourneyService } from './journey.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JourneyPlan, Journey } from 'entities/all_plans.entity';
import { CheckIn } from 'entities/all_plans.entity';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Shift } from 'entities/employee/shift.entity';
import { VacationDate } from 'entities/employee/vacation-date.entity';
import { NotificationService } from 'src/notification/notification.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';

// Mock everything
jest.mock('entities/all_plans.entity', () => ({ 
  JourneyPlan: class {}, 
  Journey: class {}, 
  CheckIn: class {},
  JourneyType: { PLANNED: 'planned', UNPLANNED: 'unplanned' },
  JourneyStatus: { ABSENT: 'absent', PRESENT: 'present' }
}), { virtual: true });
jest.mock('entities/user.entity', () => ({ User: class {} }), { virtual: true });
jest.mock('entities/branch.entity', () => ({ Branch: class {} }), { virtual: true });
jest.mock('entities/employee/shift.entity', () => ({ Shift: class {} }), { virtual: true });
jest.mock('entities/employee/vacation-date.entity', () => ({ VacationDate: class {} }), { virtual: true });
jest.mock('src/notification/notification.service', () => ({ NotificationService: class {} }), { virtual: true });
jest.mock('common/crud.service', () => ({ CRUD: { findAll: jest.fn(), findOne: jest.fn() } }), { virtual: true });

describe('JourneyService Deletion', () => {
  let service: JourneyService;
  let journeyPlanRepo: Repository<JourneyPlan>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JourneyService,
        { provide: getRepositoryToken(JourneyPlan), useValue: { find: jest.fn(), delete: jest.fn() } },
        { provide: getRepositoryToken(Journey), useValue: {} },
        { provide: getRepositoryToken(CheckIn), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(Branch), useValue: {} },
        { provide: getRepositoryToken(Shift), useValue: {} },
        { provide: getRepositoryToken(VacationDate), useValue: {} },
        { provide: NotificationService, useValue: {} },
      ],
    }).compile();

    service = module.get<JourneyService>(JourneyService);
    journeyPlanRepo = module.get(getRepositoryToken(JourneyPlan));
  });

  it('should throw BadRequestException if userId is missing', async () => {
    await expect(service.removeAllPlansByUser('')).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException if no plans are found', async () => {
    (journeyPlanRepo.find as jest.Mock).mockResolvedValue([]);
    await expect(service.removeAllPlansByUser('user-1')).rejects.toThrow(NotFoundException);
  });

  it('should delete plans if found', async () => {
    const userId = 'user-1';
    (journeyPlanRepo.find as jest.Mock).mockResolvedValue([{ id: 'plan-1' }]);
    (journeyPlanRepo.delete as jest.Mock).mockResolvedValue({ affected: 1 });

    await service.removeAllPlansByUser(userId);

    expect(journeyPlanRepo.delete).toHaveBeenCalledWith({ user: { id: userId } });
  });
});
