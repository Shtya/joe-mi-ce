import { Module } from '@nestjs/common';
import { DocumentbuilderService } from './documentbuilder.service';
import { DocumentbuilderController } from './documentbuilder.controller';

@Module({
  controllers: [DocumentbuilderController],
  providers: [DocumentbuilderService],
})
export class DocumentbuilderModule {}
