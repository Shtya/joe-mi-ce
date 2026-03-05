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
        'shift startTime',
        'shift endTime',
        'Duration',
        'status',
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
});
