import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntranceLetter } from '../../entities/entrance-letter.entity';
import { EntranceLetterService } from './entrance-letter.service';
import { EntranceLetterController } from './entrance-letter.controller';
import { User } from '../../entities/user.entity';
import { Project } from '../../entities/project.entity';
import { Branch } from '../../entities/branch.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EntranceLetter, User, Project, Branch])],
  controllers: [EntranceLetterController],
  providers: [EntranceLetterService],
  exports: [EntranceLetterService],
})
export class EntranceLetterModule {}
