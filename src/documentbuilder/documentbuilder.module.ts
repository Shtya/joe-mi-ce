import { Module } from '@nestjs/common';
import { DocumentbuilderService } from './documentbuilder.service';
import { DocumentbuilderController } from './documentbuilder.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskField } from 'entities/documentbuilder.entity';

@Module({
    imports: [TypeOrmModule.forFeature([TaskField])],
  
  controllers: [DocumentbuilderController],
  providers: [DocumentbuilderService],
})
export class DocumentbuilderModule {}
