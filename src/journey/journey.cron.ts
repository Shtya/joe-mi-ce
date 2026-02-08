// ===== journey.cron.ts =====
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JourneyService } from './journey.service';

@Injectable()
export class JourneyCron {
  private readonly logger = new Logger(JourneyCron.name);

  constructor(private readonly journeyService: JourneyService) {}

  @Cron('0 0 * * *') // كل منتصف الليل
  async handleDailyJourneyCreation() {
    this.logger.log('🚀 Starting creation of planned journeys for tomorrow...');

    try {
      const result = await this.journeyService.createJourneysForTomorrow();
      this.logger.log(`✅ Created ${result.createdCount} planned journeys for ${result.date}`);
    } catch (error) {
      this.logger.error('❌ Error creating journeys for tomorrow:', error);
    }
  }
}
