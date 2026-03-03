import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JourneyService } from './journey.service';
import { Journey, JourneyPlan, CheckIn, JourneyStatus, JourneyType } from '../../entities/all_plans.entity';
import { User } from '../../entities/user.entity';
import { Branch } from '../../entities/branch.entity';
import { Shift } from '../../entities/employee/shift.entity';
import { VacationDate } from '../../entities/employee/vacation-date.entity';
import { Sale } from '../../entities/products/sale.entity';
import { PromoterLocation } from '../../entities/promoter-location.entity';
import { LocationLog } from '../../entities/location-log.entity';
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
        { provide: getRepositoryToken(PromoterLocation), useValue: mockRepo },
        { provide: getRepositoryToken(LocationLog), useValue: mockRepo },
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

  describe('adminRemoveCheckout', () => {
    it('should remove checkout info and set status to PRESENT for PLANNED journey', async () => {
      const mockJourney = {
        id: 'j1',
        type: JourneyType.PLANNED,
        status: JourneyStatus.CLOSED,
        checkin: { id: 'c1', checkOutTime: new Date(), checkOutDocument: 'doc.pdf' },
      };
      mockRepo.findOne.mockResolvedValue(mockJourney);
      mockRepo.save.mockImplementation(v => Promise.resolve(v));

      const result = await service.adminRemoveCheckout('user1');

      expect(result.status).toBe(JourneyStatus.PRESENT);
      expect(mockJourney.checkin.checkOutTime).toBeNull();
      expect(mockJourney.checkin.checkOutDocument).toBeNull();
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should set status to UNPLANNED_PRESENT for UNPLANNED journey', async () => {
      const mockJourney = {
        id: 'j2',
        type: JourneyType.UNPLANNED,
        status: JourneyStatus.UNPLANNED_CLOSED,
        checkin: { id: 'c2', checkOutTime: new Date() },
      };
      mockRepo.findOne.mockResolvedValue(mockJourney);

      const result = await service.adminRemoveCheckout('user1');

      expect(result.status).toBe(JourneyStatus.UNPLANNED_PRESENT);
    });

    it('should remove by journeyId if provided', async () => {
      const mockJourney = {
        id: 'journey-123',
        type: JourneyType.PLANNED,
        status: JourneyStatus.CLOSED,
        checkin: { id: 'c1', checkOutTime: new Date() },
      };
      mockRepo.findOne.mockResolvedValue(mockJourney);

      const result = await service.adminRemoveCheckout( 'journey-123');

      expect(mockRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'journey-123' },
      }));
      expect(result.id).toBe('journey-123');
    });

    it('should remove by userId and specific date if provided', async () => {
      const mockJourney = {
        id: 'j1',
        type: JourneyType.PLANNED,
        status: JourneyStatus.CLOSED,
        checkin: { id: 'c1', checkOutTime: new Date() },
      };
      mockRepo.findOne.mockResolvedValue(mockJourney);

      await service.adminRemoveCheckout( 'journey-123');

      expect(mockRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { user: { id: 'user1' }, date: '2025-01-01' },
      }));
    });
  });

  describe('adminRemoveCheckin', () => {
    it('should remove all checkin/out info and set status to ABSENT for PLANNED journey', async () => {
      const mockJourney = {
        id: 'j3',
        type: JourneyType.PLANNED,
        status: JourneyStatus.PRESENT,
        checkin: { id: 'c3', checkInTime: new Date(), checkInDocument: 'in.pdf' },
      };
      mockRepo.findOne.mockResolvedValue(mockJourney);

      const result = await service.adminRemoveCheckin('user1');

      expect(result.status).toBe(JourneyStatus.ABSENT);
      expect(mockJourney.checkin.checkInTime).toBeNull();
      expect(mockJourney.checkin.checkInDocument).toBeNull();
    });

    it('should remove by journeyId if provided', async () => {
      const mockJourney = {
        id: 'journey-456',
        type: JourneyType.PLANNED,
        status: JourneyStatus.PRESENT,
        checkin: { id: 'c1', checkInTime: new Date() },
      };
      mockRepo.findOne.mockResolvedValue(mockJourney);

      const result = await service.adminRemoveCheckin( 'journey-456');

      expect(mockRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'journey-456' },
      }));
      expect(result.id).toBe('journey-456');
    });
  });
});
