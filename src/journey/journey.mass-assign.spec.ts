import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JourneyService } from './journey.service';
import { Journey, JourneyPlan, CheckIn } from 'entities/all_plans.entity';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Shift } from 'entities/employee/shift.entity';
import { VacationDate } from 'entities/employee/vacation-date.entity';
import { Sale } from 'entities/products/sale.entity';
import { PromoterLocation } from 'entities/promoter-location.entity';
import { LocationLog } from 'entities/location-log.entity';
import { NotificationService } from 'src/notification/notification.service';
import { ERole } from 'enums/Role.enum';
import { NotFoundException } from '@nestjs/common';

describe('JourneyService - mass assign shift', () => {
  let service: JourneyService;
  
  const mockRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    manager: {
      transaction: jest.fn(async (callback) => {
          // Pass an object with the required methods to the callback
          return callback(mockRepo.manager);
      }),
      save: jest.fn(),
      delete: jest.fn(),
      create: jest.fn((entity, data) => data),
    },
  };

  const mockNotificationService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JourneyService,
        { provide: getRepositoryToken(JourneyPlan), useValue: mockRepo },
        { provide: getRepositoryToken(Journey), useValue: mockRepo },
        { provide: getRepositoryToken(CheckIn), useValue: mockRepo },
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: getRepositoryToken(Branch), useValue: mockRepo },
        { provide: getRepositoryToken(Shift), useValue: mockRepo },
        { provide: getRepositoryToken(VacationDate), useValue: mockRepo },
        { provide: getRepositoryToken(Sale), useValue: mockRepo },
        { provide: getRepositoryToken(PromoterLocation), useValue: mockRepo },
        { provide: getRepositoryToken(LocationLog), useValue: mockRepo },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<JourneyService>(JourneyService);
  });

  it('should throw NotFoundException if shift not found', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    await expect(service.assignShiftToAllPromoters({ projectId: 'p1', shiftId: 's1' }, {} as any))
      .rejects.toThrow(NotFoundException);
  });

  it('should assign shift by clearing old days instead of deleting', async () => {
    const mockShift = { id: 's1', name: 'Day Shift' };
    const mockBranchDefault = { id: 'b_default' };
    const mockBranchLast = { id: 'b_last' };
    const mockPromoter = { 
      id: 'u1', 
      name: 'P1', 
      branch: mockBranchDefault, 
      role: { name: ERole.PROMOTER } 
    };
    const mockOldPlan = {
      id: 'old1',
      days: ['monday'],
    };
    
    // Repository behavior
    mockRepo.findOne.mockResolvedValueOnce(mockShift); // shiftRepo.findOne
    mockRepo.find.mockResolvedValueOnce([mockPromoter]); // userRepo.find
    mockRepo.find.mockResolvedValueOnce([mockOldPlan]); // journeyPlanRepo.find (existing)
    
    // Mock queryBuilder for last check-in
    const mockQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ branch: mockBranchLast }),
    };
    mockRepo.manager.createQueryBuilder = jest.fn().mockReturnValue(mockQueryBuilder);

    const result = await service.assignShiftToAllPromoters({ projectId: 'pr1', shiftId: 's1' }, { id: 'admin1' } as any);

    expect(result.processedCount).toBe(1);
    
    // Verify deactivation (saving old plan with empty days)
    expect(mockOldPlan.days).toEqual([]);
    expect(mockRepo.manager.save).toHaveBeenCalledWith(JourneyPlan, mockOldPlan);

    // Verify deletion is NOT called
    expect(mockRepo.manager.delete).not.toHaveBeenCalled();

    // Verify new plan creation
    expect(mockRepo.manager.create).toHaveBeenCalledWith(JourneyPlan, expect.objectContaining({
      user: mockPromoter,
      branch: mockBranchLast,
      shift: mockShift,
    }));
  });
});
