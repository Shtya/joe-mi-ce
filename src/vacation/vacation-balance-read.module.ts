import { Module } from "@nestjs/common";
import { VacationBalanceService } from "./vacation-balance.service";

@Module({
  providers: [VacationBalanceService],
  exports: [VacationBalanceService],
})
export class VacationBalanceReadModule {}
