import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RecoveryController } from "./recovery.controller";
import { RecoveryService } from "./recovery.service";
import { RecoveryJob } from "./recovery-job.entity";

@Module({
  imports: [TypeOrmModule.forFeature([RecoveryJob])],
  controllers: [RecoveryController],
  providers: [RecoveryService],
})
export class RecoveryModule {}
