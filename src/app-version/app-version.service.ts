import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppVersion } from 'entities/app-version.entity';
import { CreateAppVersionDto } from './dto/create-app-version.dto';

@Injectable()
export class AppVersionService {
  constructor(
    @InjectRepository(AppVersion)
    private readonly appVersionRepository: Repository<AppVersion>,
  ) {}

  async getUpdateInfo() {
    const version = await this.appVersionRepository.findOne({
      order: { createdAt: 'DESC' },
    });

    if (!version) {
      return {
          updateAvailable: false,
          latestVersion: '0.0.0',
          latestBuildNumber: '0',
          isForcedUpdate: false,
          updateMessage: '',
          downloadUrl: { android: '', ios: '' },
      };
    }

    return {
      updateAvailable: true, // You might want logic here to compare versions if the client sends their current version
      ...version,
    };
  }

  async createVersion(createAppVersionDto: CreateAppVersionDto) {
    const version = this.appVersionRepository.create(createAppVersionDto);
    return this.appVersionRepository.save(version);
  }
}
