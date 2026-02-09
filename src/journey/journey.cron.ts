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

  @Cron('0 0 * * *', { timeZone: 'Asia/Riyadh' }) // 3 AM Saudi time
  async handleAutoCloseJourneys() {
    this.logger.log('🔒 Starting auto-close of open journeys at 3 AM Saudi time...');

    try {
      const result = await this.journeyService.autoCloseJourneys();
      this.logger.log(`✅ Auto-closed ${result.closedCount} out of ${result.totalFound} open journeys at ${result.timestamp}`);
    } catch (error) {
      this.logger.error('❌ Error auto-closing journeys:', error);
    }
  }
}
