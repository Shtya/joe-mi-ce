import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JourneyService } from './journey.service';
import { Journey, JourneyPlan, CheckIn, JourneyStatus } from '../../entities/all_plans.entity';
import { User } from '../../entities/user.entity';
import { Branch } from '../../entities/branch.entity';
import { Shift } from '../../entities/employee/shift.entity';
import { VacationDate } from '../../entities/employee/vacation-date.entity';
import { Sale } from '../../entities/products/sale.entity';
import { NotificationService } from '../notification/notification.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('JourneyService Regression', () => {
  let service: JourneyService;
  
  const mockRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    manager: {
      transaction: jest.fn(),
    },
  };

  const mockNotificationService = {
    notifySupervisorOnCheckin: jest.fn(),
    notifyPromoterOnCheckin: jest.fn(),
  };

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
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<JourneyService>(JourneyService);
  });

  describe('validateJourneyStatus', () => {
    it('should throw NotFoundException if journey not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.validateJourneyStatus('1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if journey is CLOSED', async () => {
      mockRepo.findOne.mockResolvedValue({ status: JourneyStatus.CLOSED });
      await expect(service.validateJourneyStatus('1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if journey is UNPLANNED_CLOSED', async () => {
      mockRepo.findOne.mockResolvedValue({ status: JourneyStatus.UNPLANNED_CLOSED });
      await expect(service.validateJourneyStatus('1')).rejects.toThrow(ForbiddenException);
    });

    it('should return 200 if journey is PRESENT', async () => {
      mockRepo.findOne.mockResolvedValue({ status: JourneyStatus.PRESENT });
      const result = await service.validateJourneyStatus('1');
      expect(result).toEqual({ code: 200, message: 'Journey is active' });
    });
  });

  describe('autoCloseJourneys', () => {
    it('should query using correct enum values', async () => {
      mockRepo.find.mockResolvedValue([]);
      await service.autoCloseJourneys();
      
      expect(mockRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: [
          { status: JourneyStatus.PRESENT },
          { status: JourneyStatus.UNPLANNED_PRESENT },
        ],
      }));
    });
  });
});
