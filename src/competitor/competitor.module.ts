import { Module } from '@nestjs/common';
import { CompetitorService } from './competitor.service';
import { CompetitorController } from './competitor.controller';
import { Competitor } from 'entities/competitor.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'entities/user.entity';
import { Project } from 'entities/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Competitor, User , Project])],

  controllers: [CompetitorController],
  providers: [CompetitorService],
})
export class CompetitorModule {}
