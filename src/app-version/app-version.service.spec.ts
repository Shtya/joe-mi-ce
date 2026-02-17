import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppVersion } from '../../entities/app-version.entity';
import { AppVersionService } from './app-version.service';

describe('AppVersionService', () => {
  let service: AppVersionService;
  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppVersionService,
        {
          provide: getRepositoryToken(AppVersion),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AppVersionService>(AppVersionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUpdateInfo', () => {
    it('should return default info if no version found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const result = await service.getUpdateInfo();
      expect(result).toEqual({
        updateAvailable: false,
        latestVersion: '0.0.0',
        latestBuildNumber: '0',
        isForcedUpdate: false,
        updateMessage: '',
        downloadUrl: { android: '', ios: '' },
      });
    });

    it('should return version info if found', async () => {
      const mockVersion = {
        latestVersion: '1.0.5',
        latestBuildNumber: '42',
        isForcedUpdate: true,
        updateMessage: 'Update now',
        downloadUrl: { android: 'url', ios: 'url' },
      };
      mockRepository.findOne.mockResolvedValue(mockVersion);
      const result = await service.getUpdateInfo();
      expect(result).toEqual({
        updateAvailable: true,
        ...mockVersion,
      });
    });
  });
});
