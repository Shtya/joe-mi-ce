import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { VacationBalanceService } from "./vacation-balance.service";

@Injectable()
export class VacationBalanceCron {
  private readonly logger = new Logger(VacationBalanceCron.name);
  constructor(private readonly balances: VacationBalanceService) {}

  @Cron("0 5 0 * * *", {
    name: "taqnia-vacation-contract-anniversaries",
    timeZone: "Asia/Riyadh",
    waitForCompletion: true,
  })
  async refresh() {
    try {
      await this.balances.refreshAnniversaries();
    } catch (error) {
      this.logger.error(
        "Taqnia vacation anniversary refresh failed",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
