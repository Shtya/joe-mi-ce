import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PayrollService } from "./payroll.service";

@Injectable()
export class PayrollCron {
  private readonly logger = new Logger(PayrollCron.name);

  constructor(private readonly payrollService: PayrollService) {}

  @Cron("0 6 * * *", {
    name: "payroll-daily-sync",
    timeZone: "Asia/Riyadh",
    waitForCompletion: true,
  })
  async handleDailyPayrollSync(now = new Date()): Promise<void> {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    try {
      await this.payrollService.syncMonthEndForEnabledProjects(now);
    } catch (error) {
      this.logger.error(
        `Daily payroll sync failed for ${parts.slice(0, 7)}`,
        error?.stack,
      );
    }
  }

  @Cron("0 0 1 1 *", {
    name: "payroll-annual-reset",
    timeZone: "Asia/Riyadh",
    waitForCompletion: true,
  })
  async handleAnnualViolationReset(): Promise<void> {
    try {
      await this.payrollService.resetAnnualCounters();
    } catch (error) {
      this.logger.error("Annual payroll violation reset failed", error?.stack);
    }
  }
}
