import { Test, TestingModule } from '@nestjs/testing';
import { ExportService } from './export.service';
import { DataSource } from 'typeorm';
import { HttpService } from '@nestjs/axios';

describe('ExportService', () => {
  let service: ExportService;

  const mockDataSource = {
    getRepository: jest.fn(),
  };

  const mockHttpService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<ExportService>(ExportService);
  });

  describe('cleanDataForExport - Unplanned Module', () => {
    it('should filter and order columns correctly for unplanned module', () => {
      const sampleData = [
        {
          id: '1',
          date: '2026-03-05',
          status: 'UNPLANNED_CLOSED',
          checkInTime: '2026-03-05T08:00:00Z',
          checkOutTime: '2026-03-05T17:00:00Z',
          checkInDocument: '/uploads/in.jpg',
          checkOutDocument: '/uploads/out.jpg',
          user: {
            id: 'u1',
            name: 'John Doe',
            username: 'johndoe',
          },
          branch: {
            id: 'b1',
            name: 'Main Branch',
            city: {
              id: 'c1',
              name: 'Cairo',
            },
            chain: {
              id: 'ch1',
              name: 'Alpha Chain',
            },
          },
          shift: {
            startTime: '08:00:00',
            endTime: '17:00:00',
          },
        },
      ];

      const result = (service as any).cleanDataForExport(sampleData, 'unplanned');

      expect(result).toHaveLength(1);
      const cleaned = result[0];

      // Expected order of keys
      const expectedKeys = [
        'user name',
        'user username',
        'city name',
        'Chain',
        'branch name',
        'Check in time',
        'Check out time',
        'date',
        'Check in image',
        'Check out image',
        'status',
        'shift startTime',
        'shift endTime',
        'Duration',
        'Status Code',
      ];

      // Assert keys and order
      expect(Object.keys(cleaned)).toEqual(expectedKeys);

      // Assert specific values
      expect(cleaned['user name']).toBe('John Doe');
      expect(cleaned['user username']).toBe('johndoe');
      expect(cleaned['city name']).toBe('Cairo');
      expect(cleaned['Chain']).toBe('Alpha Chain');
      expect(cleaned['branch name']).toBe('Main Branch');
      expect(cleaned['status']).toBe('UNPLANNED_CLOSED');
      expect(cleaned['Status Code']).toBe(1);
      expect(cleaned['Duration']).toBeDefined();
    });
  });

  describe('cleanDataForExport - General Journey and Sale Cleanup', () => {
    it('should aggressively clean metadata fields for journeys', () => {
      const sampleData = [
        {
          id: 'j1',
          'user mobile': '0123456789',
          'user avatar_url': 'http://avatar.com/1.png',
          'user password': 'secret_password',
          'role name': 'Promoter',
          'role description': 'Promoter role',
          'branch lat': 30.01,
          'branch lng': 31.02,
          'branch salesTargetType': 'amount',
          'chain logoUrl': 'http://logo.com/c1.png',
          type: 'planned',
          status: 'COMPLETED',
          date: '2026-03-05',
          'user name': 'John Doe',
        },
      ];

      const result = (service as any).cleanDataForExport(sampleData, 'journey');
      const cleaned = result[0];

      // Fields that should be removed
      expect(cleaned['user mobile']).toBeUndefined();
      expect(cleaned['user avatar_url']).toBeUndefined();
      expect(cleaned['user password']).toBeUndefined();
      expect(cleaned['role name']).toBeUndefined();
      expect(cleaned['branch lat']).toBeUndefined();
      expect(cleaned['chain logoUrl']).toBeUndefined();
      expect(cleaned['type']).toBeUndefined();

      // Fields that should remain
      expect(cleaned['user name']).toBe('John Doe');
      expect(cleaned['status']).toBe('COMPLETED');
    });

    it('should separate sale cleanup from journey cleanup', () => {
      const sampleSaleData = [
        {
          id: 's1',
          sale_date: '2026-03-05',
          created_at: '2026-03-05T10:00:00Z',
          'product id': 'p1',
          'role name': 'Distributor', // Should NOT be removed from sale unless specified in saleKeysToRemove
          amount: 100,
        },
      ];

      const result = (service as any).cleanDataForExport(sampleSaleData, 'sale');
      const cleaned = result[0];

      // Fields that should be removed for sale
      expect(cleaned['sale_date']).toBeUndefined();
      expect(cleaned['created_at']).toBeUndefined();
      expect(cleaned['product id']).toBeUndefined();

      // Fields that should REMAIN for sale (because they are only in journeyKeysToRemove)
      expect(cleaned['role name']).toBe('Distributor');
      expect(cleaned['amount']).toBe(100);
    });
  });
});
