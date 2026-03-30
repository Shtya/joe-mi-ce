import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Training } from "../../entities/training.entity";
import { TrainingService } from "./training.service";
import { TrainingController } from "./training.controller";
import { User } from "../../entities/user.entity";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [TypeOrmModule.forFeature([Training, User]), UsersModule],
  controllers: [TrainingController],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}
