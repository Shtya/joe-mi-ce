import { Module } from '@nestjs/common';
import { DocumentbuilderService } from './documentbuilder.service';
import { DocumentbuilderController } from './documentbuilder.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskField, DocumentBuilder, DocumentElement } from 'entities/documentbuilder.entity';

@Module({
    imports: [TypeOrmModule.forFeature([TaskField, DocumentBuilder, DocumentElement])],
  
  controllers: [DocumentbuilderController],
  providers: [DocumentbuilderService],
})
export class DocumentbuilderModule {}
